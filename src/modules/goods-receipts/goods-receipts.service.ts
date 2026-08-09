import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  In,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';
import { getAppConfig } from '../../config/app.config';
import { DocumentCounter } from '../../entities/inventory/document-counter.entity';
import { GoodsReceiptAttachment } from '../../entities/inventory/goods-receipt-attachment.entity';
import { GoodsReceiptItem } from '../../entities/inventory/goods-receipt-item.entity';
import { GoodsReceipt } from '../../entities/inventory/goods-receipt.entity';
import { Material } from '../../entities/master/material.entity';
import { Organization } from '../../entities/master/organization.entity';
import { RejectReason } from '../../entities/master/reject-reason.entity';
import { SupplierMaterial } from '../../entities/master/supplier-material.entity';
import { Supplier } from '../../entities/master/supplier.entity';
import { Unit } from '../../entities/master/unit.entity';
import { AddGoodsReceiptAttachmentsDto } from './dto/add-goods-receipt-attachments.dto';
import { CancelGoodsReceiptDto } from './dto/cancel-goods-receipt.dto';
import {
  CreateGoodsReceiptDto,
  GoodsReceiptAttachmentInputDto,
} from './dto/create-goods-receipt.dto';
import { GoodsReceiptItemDto } from './dto/goods-receipt-item.dto';
import {
  GoodsReceiptSortBy,
  ListGoodsReceiptsQueryDto,
} from './dto/list-goods-receipts-query.dto';
import { UpdateGoodsReceiptDto } from './dto/update-goods-receipt.dto';
import {
  GOODS_RECEIPT_ATTACHMENT_MAX_COUNT,
  GoodsReceiptAttachmentStorageService,
} from './goods-receipt-attachment-storage.service';

const GOODS_RECEIPT_SORT_COLUMNS: Record<GoodsReceiptSortBy, string> = {
  receiptNo: 'goodsReceipt.receiptNo',
  receiptDate: 'goodsReceipt.receiptDate',
  supplierDocNo: 'goodsReceipt.supplierDocNo',
  createdAt: 'goodsReceipt.createdAt',
  updatedAt: 'goodsReceipt.updatedAt',
};

const DOC_TYPE_GOODS_RECEIPT = 'GOODS_RECEIPT';
const DECIMAL_SCALE = 4;

export interface LookupResponse {
  id: string;
  code: string;
  nameTh?: string;
  nameEn?: string | null;
  name?: string;
  symbol?: string | null;
}

@Injectable()
export class GoodsReceiptsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(GoodsReceiptsService.name);

  constructor(
    @InjectRepository(GoodsReceipt)
    private readonly goodsReceiptRepository: Repository<GoodsReceipt>,
    @InjectRepository(GoodsReceiptItem)
    private readonly itemRepository: Repository<GoodsReceiptItem>,
    @InjectRepository(GoodsReceiptAttachment)
    private readonly attachmentRepository: Repository<GoodsReceiptAttachment>,
    @InjectRepository(Supplier)
    private readonly supplierRepository: Repository<Supplier>,
    @InjectRepository(Material)
    private readonly materialRepository: Repository<Material>,
    @InjectRepository(Unit)
    private readonly unitRepository: Repository<Unit>,
    @InjectRepository(RejectReason)
    private readonly rejectReasonRepository: Repository<RejectReason>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly attachmentStorage: GoodsReceiptAttachmentStorageService,
  ) {}

  // ---------------------------------------------------------------- commands

  /**
   * Goods Receipt ต้องระบุองค์กรเสมอ และระบบ IAM ปัจจุบันยังไม่ได้ผูก
   * User/Department กับองค์กร จึง fail fast หาก config ชี้ไปยังองค์กรที่ใช้ไม่ได้
   * แทนที่จะให้ผู้ใช้พบข้อผิดพลาดตอนกดบันทึกเอกสารครั้งแรก
   */
  async onApplicationBootstrap(): Promise<void> {
    const code = getAppConfig().defaultOrganizationCode;
    const organization = await this.dataSource
      .getRepository(Organization)
      .findOne({
        where: { code },
      });
    if (!organization) {
      throw new Error(`Default organization ${code} does not exist`);
    }
    if (!organization.isActive) {
      throw new Error(`Default organization ${code} is inactive`);
    }
  }

  async create(dto: CreateGoodsReceiptDto, userId: string) {
    this.assertReceiptDateNotFuture(dto.receiptDate);
    this.assertItemRules(dto.items);

    const promoted: string[] = [];
    try {
      const id = await this.dataSource.transaction(async (manager) => {
        const organizationId = await this.resolveOrganizationId(manager);
        await this.assertActiveSupplier(manager, dto.supplierId);
        await this.assertMaterialsAvailable(manager, dto.supplierId, dto.items);
        await this.assertRejectReasonsActive(manager, dto.items);

        const receiptRepository = manager.getRepository(GoodsReceipt);
        const receipt = receiptRepository.create({
          receiptNo: null,
          organizationId,
          supplierId: dto.supplierId,
          receiptDate: dto.receiptDate,
          status: 'draft',
          remark: dto.remark ?? null,
          createdBy: userId,
          updatedBy: userId,
        });
        const saved = await this.saveReceipt(receiptRepository, receipt);

        await this.replaceItems(manager, saved.id, dto.items, userId);
        await this.appendAttachments(
          manager,
          saved.id,
          dto.attachments ?? [],
          userId,
          promoted,
        );
        return saved.id;
      });
      return this.findOne(id);
    } catch (error) {
      await this.compensatePromoted(promoted);
      throw error;
    }
  }

  async update(id: string, dto: UpdateGoodsReceiptDto, userId: string) {
    if (dto.receiptDate) this.assertReceiptDateNotFuture(dto.receiptDate);
    if (dto.items) this.assertItemRules(dto.items);

    await this.dataSource.transaction(async (manager) => {
      const receiptRepository = manager.getRepository(GoodsReceipt);
      const receipt = await receiptRepository.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!receipt) {
        throw new NotFoundException('Goods receipt not found');
      }
      if (receipt.status !== 'draft') {
        throw new ConflictException('Only a draft goods receipt can be edited');
      }
      if (
        dto.updatedAt &&
        new Date(dto.updatedAt).getTime() !== new Date(receipt.updatedAt).getTime()
      ) {
        throw new ConflictException('Goods receipt has been updated');
      }

      const supplierId = dto.supplierId ?? receipt.supplierId;
      if (dto.supplierId) {
        await this.assertActiveSupplier(manager, dto.supplierId);
      }

      const items =
        dto.items ??
        (await manager.getRepository(GoodsReceiptItem).find({
          where: { goodsReceiptId: id },
          order: { lineNo: 'ASC' },
        }));
      const itemInputs = this.toItemInputs(items);
      await this.assertMaterialsAvailable(manager, supplierId, itemInputs);
      if (dto.items) {
        await this.assertRejectReasonsActive(manager, dto.items);
      }

      if (dto.supplierId !== undefined) receipt.supplierId = dto.supplierId;
      if (dto.receiptDate !== undefined) receipt.receiptDate = dto.receiptDate;
      if (dto.remark !== undefined) receipt.remark = dto.remark;
      receipt.updatedBy = userId;
      await this.saveReceipt(receiptRepository, receipt);

      if (dto.items) {
        await this.replaceItems(manager, receipt.id, dto.items, userId);
      }
    });
    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    const filePaths = await this.dataSource.transaction(async (manager) => {
      const receiptRepository = manager.getRepository(GoodsReceipt);
      const receipt = await receiptRepository.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!receipt) {
        throw new NotFoundException('Goods receipt not found');
      }
      if (receipt.status !== 'draft') {
        throw new ConflictException(
          'Only a draft goods receipt can be deleted',
        );
      }
      const attachments = await manager
        .getRepository(GoodsReceiptAttachment)
        .find({ where: { goodsReceiptId: id } });
      await receiptRepository.delete({ id });
      return attachments.map((attachment) => attachment.filePath);
    });
    await this.compensatePromoted(filePaths);
  }

  async post(id: string, userId: string) {
    await this.dataSource.transaction(async (manager) => {
      const receiptRepository = manager.getRepository(GoodsReceipt);
      const receipt = await receiptRepository.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!receipt) {
        throw new NotFoundException('Goods receipt not found');
      }
      if (receipt.status !== 'draft') {
        throw new ConflictException('Only a draft goods receipt can be posted');
      }
      this.assertReceiptDateNotFuture(receipt.receiptDate);

      const itemRepository = manager.getRepository(GoodsReceiptItem);
      const items = await itemRepository.find({
        where: { goodsReceiptId: id },
        order: { lineNo: 'ASC' },
      });
      if (items.length === 0) {
        throw new BadRequestException(
          'A goods receipt must contain at least one item before posting',
        );
      }
      // Validate each item has supplier doc info or no-supplier-doc flag
      for (const item of items) {
        if (!item.noSupplierDocument && !item.supplierDocNo) {
          throw new BadRequestException(
            `Line ${item.lineNo}: supplierDocNo is required unless noSupplierDocument is true`,
          );
        }
      }
      const itemInputs = this.toItemInputs(items);
      this.assertItemRules(itemInputs);
      await this.assertActiveSupplier(manager, receipt.supplierId);
      await this.assertMaterialsAvailable(
        manager,
        receipt.supplierId,
        itemInputs,
      );

      const materials = await manager.getRepository(Material).find({
        where: { id: In(items.map((item) => item.materialId)) },
      });
      const materialById = new Map(
        materials.map((material) => [material.id, material]),
      );
      for (const item of items) {
        const material = materialById.get(item.materialId);
        if (!material) {
          throw new NotFoundException(`Material ${item.materialId} not found`);
        }
        item.materialCode = material.code;
        item.materialName = material.name;
        item.updatedBy = userId;
      }
      await itemRepository.save(items);

      receipt.receiptNo = await this.allocateReceiptNo(
        manager,
        receipt.organizationId,
        receipt.receiptDate,
      );
      receipt.status = 'posted';
      receipt.postedBy = userId;
      receipt.postedAt = new Date();
      receipt.updatedBy = userId;
      await this.saveReceipt(receiptRepository, receipt);
    });
    return this.findOne(id);
  }

  async cancel(id: string, dto: CancelGoodsReceiptDto, userId: string) {
    await this.dataSource.transaction(async (manager) => {
      const receiptRepository = manager.getRepository(GoodsReceipt);
      const receipt = await receiptRepository.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!receipt) {
        throw new NotFoundException('Goods receipt not found');
      }
      if (receipt.status !== 'posted') {
        throw new ConflictException(
          'Only a posted goods receipt can be cancelled',
        );
      }
      receipt.status = 'cancelled';
      receipt.cancelledBy = userId;
      receipt.cancelledAt = new Date();
      receipt.cancelReason = dto.cancelReason.trim();
      receipt.updatedBy = userId;
      await this.saveReceipt(receiptRepository, receipt);
    });
    return this.findOne(id);
  }

  async addAttachments(
    id: string,
    dto: AddGoodsReceiptAttachmentsDto,
    userId: string,
  ) {
    const promoted: string[] = [];
    try {
      await this.dataSource.transaction(async (manager) => {
        const receipt = await manager.getRepository(GoodsReceipt).findOne({
          where: { id },
          lock: { mode: 'pessimistic_write' },
        });
        if (!receipt) {
          throw new NotFoundException('Goods receipt not found');
        }
        if (receipt.status === 'cancelled') {
          throw new ConflictException(
            'Cannot attach files to a cancelled goods receipt',
          );
        }
        await this.appendAttachments(
          manager,
          id,
          dto.attachments,
          userId,
          promoted,
        );
      });
      return this.findOne(id);
    } catch (error) {
      await this.compensatePromoted(promoted);
      throw error;
    }
  }

  async removeAttachment(id: string, attachmentId: string): Promise<void> {
    const filePath = await this.dataSource.transaction(async (manager) => {
      const receipt = await manager.getRepository(GoodsReceipt).findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!receipt) {
        throw new NotFoundException('Goods receipt not found');
      }
      if (receipt.status !== 'draft') {
        throw new ConflictException(
          'Attachments can only be removed while the goods receipt is a draft',
        );
      }
      const attachmentRepository = manager.getRepository(
        GoodsReceiptAttachment,
      );
      const attachment = await attachmentRepository.findOne({
        where: { id: attachmentId, goodsReceiptId: id },
      });
      if (!attachment) {
        throw new NotFoundException('Attachment not found');
      }
      await attachmentRepository.delete({ id: attachmentId });
      return attachment.filePath;
    });
    await this.compensatePromoted([filePath]);
  }

  // ----------------------------------------------------------------- queries

  async findAll(query: ListGoodsReceiptsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const queryBuilder = this.createListQuery(query);

    const sortColumn =
      GOODS_RECEIPT_SORT_COLUMNS[query.sortBy] ??
      GOODS_RECEIPT_SORT_COLUMNS.receiptDate;
    const sortOrder = query.sortOrder === 'asc' ? 'ASC' : 'DESC';
    const [receipts, totalItems] = await queryBuilder
      .orderBy(sortColumn, sortOrder)
      .addOrderBy('goodsReceipt.id', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    const summaries = await this.loadItemSummaries(
      receipts.map((receipt) => receipt.id),
    );

    return {
      items: receipts.map((receipt) => ({
        ...this.toHeaderResponse(receipt),
        supplier: receipt.supplier ? this.toLookup(receipt.supplier) : null,
        itemCount: summaries.get(receipt.id)?.itemCount ?? 0,
        totalQtyReceived: summaries.get(receipt.id)?.totalQtyReceived ?? '0',
      })),
      meta: {
        page,
        limit,
        totalItems,
        totalPages: Math.ceil(totalItems / limit),
      },
    };
  }

  async findOne(id: string) {
    const receipt = await this.goodsReceiptRepository
      .createQueryBuilder('goodsReceipt')
      .leftJoinAndSelect('goodsReceipt.supplier', 'supplier')
      .leftJoinAndSelect('goodsReceipt.organization', 'organization')
      .where('goodsReceipt.id = :id', { id })
      .getOne();
    if (!receipt) {
      throw new NotFoundException('Goods receipt not found');
    }

    const items = await this.itemRepository
      .createQueryBuilder('item')
      .leftJoinAndSelect('item.material', 'material')
      .leftJoinAndSelect('item.unit', 'unit')
      .leftJoinAndSelect('item.rejectReason', 'rejectReason')
      .where('item.goodsReceiptId = :id', { id })
      .orderBy('item.line_no', 'ASC')
      .getMany();

    const attachments = await this.attachmentRepository.find({
      where: { goodsReceiptId: id },
      order: { id: 'ASC' },
    });

    return {
      ...this.toHeaderResponse(receipt),
      supplier: receipt.supplier ? this.toLookup(receipt.supplier) : null,
      organization: receipt.organization
        ? this.toLookup(receipt.organization)
        : null,
      items: items.map((item) => this.toItemResponse(item)),
      attachments: attachments.map((attachment) => ({
        id: attachment.id,
        docType: attachment.docType,
        filePath: attachment.filePath,
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        fileSize: attachment.fileSize,
        createdBy: attachment.createdBy,
        createdAt: attachment.createdAt,
      })),
    };
  }

  async getLookups(supplierId?: string) {
    const activeOnly = {
      where: { isActive: true },
      order: { code: 'ASC' as const },
    };
    const [suppliers, units, rejectReasons] = await Promise.all([
      this.supplierRepository.find(activeOnly),
      this.unitRepository.find(activeOnly),
      this.rejectReasonRepository.find(activeOnly),
    ]);

    const materialQuery = this.materialRepository
      .createQueryBuilder('material')
      .where('material.isActive = TRUE');
    if (supplierId) {
      materialQuery.andWhere(
        `EXISTS (
          SELECT 1
          FROM master.supplier_materials mapping
          INNER JOIN master.suppliers mapped_supplier
            ON mapped_supplier.id = mapping.supplier_id
          WHERE mapping.material_id = material.id
            AND mapping.supplier_id = :supplierId
            AND mapping.is_active = TRUE
            AND mapped_supplier.is_active = TRUE
        )`,
        { supplierId },
      );
    }
    const materials = await materialQuery
      .orderBy('material.code', 'ASC')
      .getMany();

    return {
      suppliers: suppliers.map((supplier) => this.toLookup(supplier)),
      units: units.map((unit) => this.toLookup(unit)),
      rejectReasons: rejectReasons.map((reason) => this.toLookup(reason)),
      materials: materials.map((material) => ({
        id: material.id,
        code: material.code,
        name: material.name,
        unitId: material.unitId,
      })),
    };
  }

  // ----------------------------------------------------------------- helpers

  private createListQuery(
    query: ListGoodsReceiptsQueryDto,
  ): SelectQueryBuilder<GoodsReceipt> {
    const queryBuilder = this.goodsReceiptRepository
      .createQueryBuilder('goodsReceipt')
      .leftJoinAndSelect('goodsReceipt.supplier', 'supplier');

    if (query.search) {
      queryBuilder.andWhere(
        '(goodsReceipt.receipt_no ILIKE :search OR goodsReceipt.supplier_doc_no ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }
    if (query.status) {
      queryBuilder.andWhere('goodsReceipt.status = :status', {
        status: query.status,
      });
    }
    if (query.supplierId) {
      queryBuilder.andWhere('goodsReceipt.supplier_id = :supplierId', {
        supplierId: query.supplierId,
      });
    }
    if (query.receiptDateFrom) {
      queryBuilder.andWhere('goodsReceipt.receipt_date >= :receiptDateFrom', {
        receiptDateFrom: query.receiptDateFrom,
      });
    }
    if (query.receiptDateTo) {
      queryBuilder.andWhere('goodsReceipt.receipt_date <= :receiptDateTo', {
        receiptDateTo: query.receiptDateTo,
      });
    }
    if (query.materialId) {
      queryBuilder.andWhere(
        `EXISTS (
          SELECT 1 FROM inventory.goods_receipt_items line
          WHERE line.goods_receipt_id = goodsReceipt.id
            AND line.material_id = :materialId
        )`,
        { materialId: query.materialId },
      );
    }
    if (query.hasRejection !== undefined) {
      const clause = `EXISTS (
        SELECT 1 FROM inventory.goods_receipt_items rejection
        WHERE rejection.goods_receipt_id = goodsReceipt.id
          AND rejection.qty_rejected > 0
      )`;
      queryBuilder.andWhere(query.hasRejection ? clause : `NOT ${clause}`);
    }
    return queryBuilder;
  }

  private async loadItemSummaries(
    receiptIds: string[],
  ): Promise<Map<string, { itemCount: number; totalQtyReceived: string }>> {
    const summaries = new Map<
      string,
      { itemCount: number; totalQtyReceived: string }
    >();
    if (receiptIds.length === 0) return summaries;

    const rows = await this.itemRepository
      .createQueryBuilder('item')
      .select('item.goods_receipt_id', 'goodsReceiptId')
      .addSelect('COUNT(item.id)', 'itemCount')
      .addSelect('COALESCE(SUM(item.qty_received), 0)', 'totalQtyReceived')
      .where('item.goods_receipt_id IN (:...receiptIds)', { receiptIds })
      .groupBy('item.goods_receipt_id')
      .getRawMany<{
        goodsReceiptId: string;
        itemCount: string;
        totalQtyReceived: string;
      }>();

    for (const row of rows) {
      summaries.set(String(row.goodsReceiptId), {
        itemCount: Number(row.itemCount),
        totalQtyReceived: String(row.totalQtyReceived),
      });
    }
    return summaries;
  }

  private async resolveOrganizationId(manager: EntityManager): Promise<string> {
    const code = getAppConfig().defaultOrganizationCode;
    const organization = await manager.getRepository(Organization).findOne({
      where: { code },
    });
    if (!organization) {
      throw new BadRequestException(
        `Default organization ${code} does not exist`,
      );
    }
    if (!organization.isActive) {
      throw new BadRequestException(`Default organization ${code} is inactive`);
    }
    return organization.id;
  }

  private async allocateReceiptNo(
    manager: EntityManager,
    organizationId: string,
    receiptDate: string,
  ): Promise<string> {
    const period = `${receiptDate.slice(0, 4)}${receiptDate.slice(5, 7)}`;
    const counterRepository = manager.getRepository(DocumentCounter);
    const where = {
      organizationId,
      docType: DOC_TYPE_GOODS_RECEIPT,
      period,
    };

    let counter = await counterRepository.findOne({
      where,
      lock: { mode: 'pessimistic_write' },
    });
    if (!counter) {
      await manager.query(
        `INSERT INTO inventory.document_counters
           (organization_id, doc_type, period, last_number)
         VALUES ($1, $2, $3, 0)
         ON CONFLICT (organization_id, doc_type, period) DO NOTHING`,
        [organizationId, DOC_TYPE_GOODS_RECEIPT, period],
      );
      counter = await counterRepository.findOne({
        where,
        lock: { mode: 'pessimistic_write' },
      });
    }
    if (!counter) {
      throw new ConflictException('Failed to allocate goods receipt number');
    }

    counter.lastNumber += 1;
    await counterRepository.save(counter);
    return `GR-${period}-${String(counter.lastNumber).padStart(4, '0')}`;
  }

  private async replaceItems(
    manager: EntityManager,
    goodsReceiptId: string,
    items: GoodsReceiptItemDto[],
    userId: string,
  ): Promise<void> {
    const itemRepository = manager.getRepository(GoodsReceiptItem);
    await itemRepository.delete({ goodsReceiptId });
    if (items.length === 0) return;

    const materials = await manager.getRepository(Material).find({
      where: { id: In(items.map((item) => item.materialId)) },
    });
    const unitByMaterialId = new Map(
      materials.map((material) => [material.id, material.unitId]),
    );

    const rows = items.map((item, index) => {
      const unitId = unitByMaterialId.get(item.materialId);
      if (!unitId) {
        throw new NotFoundException(`Material ${item.materialId} not found`);
      }
      return itemRepository.create({
        goodsReceiptId,
        lineNo: index + 1,
        poNo: item.poNo ?? null,
        supplierDocNo: item.supplierDocNo ?? null,
        supplierDocDate: item.supplierDocDate ?? null,
        noSupplierDocument: item.noSupplierDocument ?? false,
        filePath: item.filePath ?? null,
        fileName: item.fileName ?? null,
        materialId: item.materialId,
        materialCode: null,
        materialName: null,
        unitId,
        // Default qtyDelivered to qtyReceived if not provided
        qtyDelivered: item.qtyDelivered ?? item.qtyReceived,
        qtyReceived: item.qtyReceived,
        qtyRejected: item.qtyRejected ?? '0',
        rejectReasonId: item.rejectReasonId ?? null,
        rejectNote: item.rejectNote ?? null,
        lotNo: item.lotNo ?? null,
        productionDate: item.productionDate ?? null,
        expiryDate: item.expiryDate ?? null,
        unitPrice: item.unitPrice ?? null,
        lineAmount: item.lineAmount ?? null,
        remark: item.remark ?? null,
        createdBy: userId,
        updatedBy: userId,
      });
    });
    try {
      await itemRepository.save(rows);
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException(
          'The same material and lot cannot appear twice in one goods receipt',
        );
      }
      throw error;
    }
  }

  private async appendAttachments(
    manager: EntityManager,
    goodsReceiptId: string,
    attachments: GoodsReceiptAttachmentInputDto[],
    userId: string,
    promoted: string[],
  ): Promise<void> {
    if (attachments.length === 0) return;

    const attachmentRepository = manager.getRepository(GoodsReceiptAttachment);
    const existingCount = await attachmentRepository.count({
      where: { goodsReceiptId },
    });
    if (existingCount + attachments.length > GOODS_RECEIPT_ATTACHMENT_MAX_COUNT)
      throw new BadRequestException(
        `A goods receipt cannot have more than ${GOODS_RECEIPT_ATTACHMENT_MAX_COUNT} attachments`,
      );

    const rows: GoodsReceiptAttachment[] = [];
    for (const attachment of attachments) {
      const filePath = await this.attachmentStorage.promote(
        attachment.filePath,
      );
      promoted.push(filePath);
      const described = await this.attachmentStorage.describe(filePath);
      rows.push(
        attachmentRepository.create({
          goodsReceiptId,
          docType: attachment.docType,
          filePath,
          fileName: attachment.fileName,
          mimeType: described.mimeType,
          fileSize: described.fileSize,
          createdBy: userId,
        }),
      );
    }
    await attachmentRepository.save(rows);
  }

  private async compensatePromoted(filePaths: string[]): Promise<void> {
    for (const filePath of filePaths) {
      try {
        await this.attachmentStorage.discard(filePath);
      } catch (error) {
        this.logger.warn(`Failed to discard attachment ${filePath}`, error);
      }
    }
  }

  private toItemInputs(
    items: GoodsReceiptItemDto[] | GoodsReceiptItem[],
  ): GoodsReceiptItemDto[] {
    return items.map((item) => ({
      materialId: item.materialId,
      poNo: item.poNo ?? null,
      supplierDocNo: item.supplierDocNo ?? null,
      supplierDocDate: item.supplierDocDate ?? null,
      noSupplierDocument: item.noSupplierDocument ?? false,
      filePath: item.filePath ?? null,
      fileName: item.fileName ?? null,
      // Default qtyDelivered to qtyReceived if not provided
      qtyDelivered: item.qtyDelivered ?? item.qtyReceived,
      qtyReceived: item.qtyReceived,
      qtyRejected: item.qtyRejected ?? '0',
      rejectReasonId: item.rejectReasonId ?? null,
      rejectNote: item.rejectNote ?? null,
      lotNo: item.lotNo ?? null,
      productionDate: item.productionDate ?? null,
      expiryDate: item.expiryDate ?? null,
      unitPrice: item.unitPrice ?? null,
      lineAmount: item.lineAmount ?? null,
      remark: item.remark ?? null,
    }));
  }

  private assertReceiptDateNotFuture(receiptDate: string): void {
    const today = new Date().toISOString().slice(0, 10);
    if (receiptDate > today) {
      throw new BadRequestException('receiptDate cannot be in the future');
    }
  }

  private assertItemRules(items: GoodsReceiptItemDto[]): void {
    const seen = new Set<string>();
    items.forEach((item, index) => {
      const label = `items[${index}]`;
      // Default qtyDelivered to qtyReceived if not provided (simplified workflow)
      const delivered = this.toScaled(item.qtyDelivered ?? item.qtyReceived);
      const received = this.toScaled(item.qtyReceived);
      const rejected = this.toScaled(item.qtyRejected ?? '0');

      // Simplified: qtyReceived must be > 0
      if (received === 0n) {
        throw new BadRequestException(
          `${label}: qtyReceived must be greater than zero`,
        );
      }

      const key = `${item.materialId}::${item.lotNo ?? ''}`;
      if (seen.has(key)) {
        throw new BadRequestException(
          `${label}: the same material and lot cannot appear twice in one goods receipt`,
        );
      }
      seen.add(key);
    });
  }

  /** แปลง NUMERIC(18,4) เป็นจำนวนเต็มคูณ 10^4 เพื่อเทียบค่าโดยไม่เสียความละเอียด */
  private toScaled(value: string): bigint {
    const [integerPart, fractionPart = ''] = value.split('.');
    const fraction = `${fractionPart}0000`.slice(0, DECIMAL_SCALE);
    return BigInt(`${integerPart}${fraction}`);
  }

  private async assertActiveSupplier(
    manager: EntityManager,
    supplierId: string,
  ): Promise<void> {
    const supplier = await manager.getRepository(Supplier).findOne({
      where: { id: supplierId },
      lock: { mode: 'pessimistic_read' },
    });
    if (!supplier) {
      throw new NotFoundException('Supplier not found');
    }
    if (!supplier.isActive) {
      throw new BadRequestException('Supplier is inactive');
    }
  }

  private async assertRejectReasonsActive(
    manager: EntityManager,
    items: GoodsReceiptItemDto[],
  ): Promise<void> {
    const ids = [
      ...new Set(
        items
          .map((item) => item.rejectReasonId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    if (ids.length === 0) return;

    const reasons = await manager
      .getRepository(RejectReason)
      .find({ where: { id: In(ids) } });
    const reasonById = new Map(reasons.map((reason) => [reason.id, reason]));
    for (const id of ids) {
      const reason = reasonById.get(id);
      if (!reason) {
        throw new NotFoundException(`Reject reason ${id} not found`);
      }
      if (!reason.isActive) {
        throw new BadRequestException(`Reject reason ${id} is inactive`);
      }
    }
  }

  private async assertMaterialsAvailable(
    manager: EntityManager,
    supplierId: string,
    items: GoodsReceiptItemDto[],
  ): Promise<void> {
    const materialIds = [...new Set(items.map((item) => item.materialId))];
    if (materialIds.length === 0) return;

    const materials = await manager
      .getRepository(Material)
      .find({ where: { id: In(materialIds) } });
    const materialById = new Map(
      materials.map((material) => [material.id, material]),
    );
    for (const materialId of materialIds) {
      const material = materialById.get(materialId);
      if (!material) {
        throw new NotFoundException(`Material ${materialId} not found`);
      }
      if (!material.isActive) {
        throw new BadRequestException(`Material ${materialId} is inactive`);
      }
    }

    const mappings = await manager.getRepository(SupplierMaterial).find({
      where: {
        supplierId,
        materialId: In(materialIds),
        isActive: true,
      },
    });
    const mapped = new Set(mappings.map((mapping) => mapping.materialId));
    const unmapped = materialIds.find((materialId) => !mapped.has(materialId));
    if (unmapped) {
      throw new BadRequestException(
        `Material ${unmapped} is not linked to supplier ${supplierId}. Link them in Material Master first.`,
      );
    }
  }

  private async saveReceipt(
    repository: Repository<GoodsReceipt>,
    receipt: GoodsReceipt,
  ): Promise<GoodsReceipt> {
    try {
      return await repository.save(receipt);
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException(
          'A goods receipt with the same supplier document number already exists',
        );
      }
      throw error;
    }
  }

  private isUniqueViolation(error: unknown): boolean {
    const databaseError = error as {
      code?: string;
      driverError?: { code?: string };
    };
    return (
      databaseError.code === '23505' ||
      databaseError.driverError?.code === '23505'
    );
  }

  private toHeaderResponse(receipt: GoodsReceipt) {
    return {
      id: receipt.id,
      receiptNo: receipt.receiptNo,
      organizationId: receipt.organizationId,
      supplierId: receipt.supplierId,
      receiptDate: receipt.receiptDate,
      status: receipt.status,
      remark: receipt.remark,
      postedBy: receipt.postedBy,
      postedAt: receipt.postedAt,
      cancelledBy: receipt.cancelledBy,
      cancelledAt: receipt.cancelledAt,
      cancelReason: receipt.cancelReason,
      createdBy: receipt.createdBy,
      updatedBy: receipt.updatedBy,
      createdAt: receipt.createdAt,
      updatedAt: receipt.updatedAt,
    };
  }

  private toItemResponse(item: GoodsReceiptItem) {
    return {
      id: item.id,
      lineNo: item.lineNo,
      poNo: item.poNo,
      supplierDocNo: item.supplierDocNo,
      supplierDocDate: item.supplierDocDate,
      noSupplierDocument: item.noSupplierDocument,
      filePath: item.filePath,
      fileName: item.fileName,
      materialId: item.materialId,
      materialCode: item.materialCode,
      materialName: item.materialName,
      unitId: item.unitId,
      qtyDelivered: item.qtyDelivered,
      qtyReceived: item.qtyReceived,
      qtyRejected: item.qtyRejected,
      rejectReasonId: item.rejectReasonId,
      rejectNote: item.rejectNote,
      lotNo: item.lotNo,
      productionDate: item.productionDate,
      expiryDate: item.expiryDate,
      unitPrice: item.unitPrice,
      lineAmount: item.lineAmount,
      remark: item.remark,
      material: item.material
        ? {
            id: item.material.id,
            code: item.material.code,
            name: item.material.name,
          }
        : null,
      unit: item.unit ? this.toLookup(item.unit) : null,
      rejectReason: item.rejectReason ? this.toLookup(item.rejectReason) : null,
    };
  }

  private toLookup(entity: {
    id: string;
    code: string;
    nameTh?: string;
    nameEn?: string | null;
    symbol?: string | null;
  }): LookupResponse {
    const result: LookupResponse = { id: entity.id, code: entity.code };
    if ('nameTh' in entity) result.nameTh = entity.nameTh;
    if ('nameEn' in entity) result.nameEn = entity.nameEn;
    if ('symbol' in entity) result.symbol = entity.symbol;
    return result;
  }
}
