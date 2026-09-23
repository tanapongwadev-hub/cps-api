import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  In,
  IsNull,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';
import { MaterialReceivingPackage } from '../../entities/inventory/material-receiving-package.entity';
import { MaterialReceiving } from '../../entities/inventory/material-receiving.entity';
import { MaterialsDisbursementCounter } from '../../entities/inventory/materials-disbursement-counter.entity';
import { StockBalance } from '../../entities/inventory/stock-balance.entity';
import { Material } from '../../entities/master/material.entity';
import { Unit } from '../../entities/master/unit.entity';
import {
  createTraceId,
  recordAuditEvent,
  recordStockMovement,
} from '../../common/stock-ledger';
import { allocateDisbursementNo } from '../../common/disbursement-number';
import { fromScaled, toScaled } from '../../common/decimal';
import { CreateMaterialsDisbursementDto } from './dto/create-materials-disbursement.dto';
import { UpdateMaterialsDisbursementDto } from './dto/update-materials-disbursement.dto';
import {
  ListMaterialsDisbursementQueryDto,
  DisbursementSortBy,
} from './dto/list-materials-disbursement-query.dto';
import { ReportMaterialsDisbursementQueryDto } from './dto/report-materials-disbursement.dto';
import { MaterialsDisbursement } from './materials-disbursement.entity';
import { MaterialDisbursementItem } from './material-disbursement-item.entity';
import { MaterialDisbursementPackage } from './material-disbursement-package.entity';

const SORT_COLUMNS: Record<DisbursementSortBy, string> = {
  disbursementNo: 'disbursement.disbursementNo',
  disbursementDate: 'disbursement.disbursementDate',
  createdAt: 'disbursement.createdAt',
};

@Injectable()
export class MaterialsDisbursementService {
  constructor(
    @InjectRepository(MaterialsDisbursement)
    private readonly disbursementRepository: Repository<MaterialsDisbursement>,
    @InjectRepository(MaterialDisbursementItem)
    private readonly itemRepository: Repository<MaterialDisbursementItem>,
    @InjectRepository(MaterialDisbursementPackage)
    private readonly packageRecordRepository: Repository<MaterialDisbursementPackage>,
    @InjectRepository(MaterialsDisbursementCounter)
    private readonly counterRepository: Repository<MaterialsDisbursementCounter>,
    @InjectRepository(MaterialReceivingPackage)
    private readonly receivingPackageRepository: Repository<MaterialReceivingPackage>,
    @InjectRepository(MaterialReceiving)
    private readonly receivingRepository: Repository<MaterialReceiving>,
    @InjectRepository(StockBalance)
    private readonly stockBalanceRepository: Repository<StockBalance>,
    @InjectRepository(Material)
    private readonly materialRepository: Repository<Material>,
    @InjectRepository(Unit)
    private readonly unitRepository: Repository<Unit>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  // ---------------------------------------------------------------- commands

  async create(
    dto: CreateMaterialsDisbursementDto,
    userId: string,
  ): Promise<MaterialsDisbursement> {
    // Validate items
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException(
        'At least one disbursement item is required',
      );
    }

    // Validate stock_cut requires reason
    if (dto.disbursementType === 'stock_cut' && !dto.reason?.trim()) {
      throw new BadRequestException(
        'Reason is required for stock_cut disbursement',
      );
    }

    // Validate disbursement date not in future
    const today = new Date().toISOString().slice(0, 10);
    if (dto.disbursementDate > today) {
      throw new BadRequestException(
        'Disbursement date cannot be in the future',
      );
    }

    // Validate positive quantities
    for (const item of dto.items) {
      if (toScaled(item.requestedQuantity) <= 0n) {
        throw new BadRequestException(
          'Requested quantity must be greater than 0',
        );
      }
    }

    const result = await this.dataSource.transaction(async (manager) => {
      // 1) Validate all materials exist and are active
      for (const item of dto.items) {
        await this.assertActiveMaterial(manager, item.materialId);
      }

      // 2) Generate disbursement number
      const disbursementNo = await allocateDisbursementNo(
        manager,
        dto.disbursementDate,
      );

      // 3) Save disbursement header
      const disbursementRepo = manager.getRepository(MaterialsDisbursement);
      const disbursement = disbursementRepo.create({
        traceId: createTraceId('ISS'),
        disbursementNo,
        disbursementType: dto.disbursementType,
        disbursementDate: dto.disbursementDate,
        status: 'draft',
        reason: dto.reason?.trim() ?? null,
        departmentId: dto.departmentId ?? null,
        productionOrder: dto.productionOrder?.trim() || null,
        referenceNo: dto.referenceNo?.trim() || null,
        requestedBy: dto.requestedBy?.trim() || null,
        approvedBy: null,
        attachmentUrl: dto.attachmentUrl ?? null,
        attachmentName: dto.attachmentName ?? null,
        remark: dto.remark?.trim() ?? null,
        createdBy: userId,
      });
      const savedDisbursement = await disbursementRepo.save(disbursement);

      // 4) Save items (disbursedQuantity = 0 until confirmed)
      const itemRepo = manager.getRepository(MaterialDisbursementItem);
      for (const itemDto of dto.items) {
        const item = itemRepo.create({
          disbursementId: savedDisbursement.id,
          materialId: itemDto.materialId,
          requestedQuantity: itemDto.requestedQuantity,
          disbursedQuantity: '0.0000',
          createdBy: userId,
        });
        await itemRepo.save(item);
      }

      await recordAuditEvent(manager, {
        traceId: savedDisbursement.traceId,
        action: 'CREATE',
        targetType: 'MATERIALS_DISBURSEMENT',
        targetId: savedDisbursement.id,
        performedBy: userId,
        departmentId: savedDisbursement.departmentId,
        after: {
          disbursementNo: savedDisbursement.disbursementNo,
          status: savedDisbursement.status,
          items: dto.items,
        },
      });

      return savedDisbursement.id;
    });

    return this.findOne(result);
  }

  async update(
    id: string,
    dto: UpdateMaterialsDisbursementDto,
    userId: string,
  ): Promise<MaterialsDisbursement> {
    await this.dataSource.transaction(async (manager) => {
      const disbursementRepo = manager.getRepository(MaterialsDisbursement);
      const disbursement = await disbursementRepo.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });

      if (!disbursement) {
        throw new NotFoundException('Materials disbursement not found');
      }
      if (disbursement.status !== 'draft') {
        throw new ConflictException('Only a draft disbursement can be edited');
      }
      const before = {
        disbursementType: disbursement.disbursementType,
        disbursementDate: disbursement.disbursementDate,
        reason: disbursement.reason,
        departmentId: disbursement.departmentId,
        productionOrder: disbursement.productionOrder,
        referenceNo: disbursement.referenceNo,
        requestedBy: disbursement.requestedBy,
        remark: disbursement.remark,
      };

      // Validate stock_cut requires reason
      const disbursementType =
        dto.disbursementType ?? disbursement.disbursementType;
      const reason = dto.reason ?? disbursement.reason;
      if (disbursementType === 'stock_cut' && !reason?.trim()) {
        throw new BadRequestException(
          'Reason is required for stock_cut disbursement',
        );
      }

      // Validate quantities if updating items
      if (dto.items) {
        if (dto.items.length === 0) {
          throw new BadRequestException(
            'At least one disbursement item is required',
          );
        }
        for (const item of dto.items) {
          if (toScaled(item.requestedQuantity) <= 0n) {
            throw new BadRequestException(
              'Requested quantity must be greater than 0',
            );
          }
          await this.assertActiveMaterial(manager, item.materialId);
        }

        // Delete existing items and packages
        const existingItems = await manager
          .getRepository(MaterialDisbursementItem)
          .find({ where: { disbursementId: id } });
        const existingItemIds = existingItems.map((i) => i.id);
        if (existingItemIds.length > 0) {
          await manager.getRepository(MaterialDisbursementPackage).delete({
            disbursementItemId: In(existingItemIds),
          });
        }
        await manager
          .getRepository(MaterialDisbursementItem)
          .delete({ disbursementId: id });

        // Create new items
        const itemRepo = manager.getRepository(MaterialDisbursementItem);
        for (const itemDto of dto.items) {
          const item = itemRepo.create({
            disbursementId: id,
            materialId: itemDto.materialId,
            requestedQuantity: itemDto.requestedQuantity,
            disbursedQuantity: '0.0000',
            createdBy: userId,
          });
          await itemRepo.save(item);
        }
      }

      // Update disbursement fields
      if (dto.disbursementType !== undefined) {
        disbursement.disbursementType = dto.disbursementType;
      }
      if (dto.disbursementDate !== undefined) {
        disbursement.disbursementDate = dto.disbursementDate;
      }
      if (dto.reason !== undefined) {
        disbursement.reason = dto.reason?.trim() ?? null;
      }
      if (dto.departmentId !== undefined) {
        disbursement.departmentId = dto.departmentId || null;
      }
      if (dto.productionOrder !== undefined) {
        disbursement.productionOrder = dto.productionOrder?.trim() || null;
      }
      if (dto.referenceNo !== undefined) {
        disbursement.referenceNo = dto.referenceNo?.trim() || null;
      }
      if (dto.requestedBy !== undefined) {
        disbursement.requestedBy = dto.requestedBy?.trim() || null;
      }
      if (dto.attachmentUrl !== undefined) {
        disbursement.attachmentUrl = dto.attachmentUrl ?? null;
      }
      if (dto.attachmentName !== undefined) {
        disbursement.attachmentName = dto.attachmentName ?? null;
      }
      if (dto.remark !== undefined) {
        disbursement.remark = dto.remark?.trim() ?? null;
      }

      await disbursementRepo.save(disbursement);
      await recordAuditEvent(manager, {
        traceId: disbursement.traceId,
        action: 'UPDATE',
        targetType: 'MATERIALS_DISBURSEMENT',
        targetId: disbursement.id,
        performedBy: userId,
        departmentId: disbursement.departmentId,
        before,
        after: {
          disbursementType: disbursement.disbursementType,
          disbursementDate: disbursement.disbursementDate,
          reason: disbursement.reason,
          departmentId: disbursement.departmentId,
          productionOrder: disbursement.productionOrder,
          referenceNo: disbursement.referenceNo,
          requestedBy: disbursement.requestedBy,
          remark: disbursement.remark,
        },
      });
    });

    return this.findOne(id);
  }

  async remove(id: string, userId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const disbursementRepo = manager.getRepository(MaterialsDisbursement);
      const disbursement = await disbursementRepo.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });

      if (!disbursement) {
        throw new NotFoundException('Materials disbursement not found');
      }
      if (disbursement.status !== 'draft') {
        throw new ConflictException('Only a draft disbursement can be deleted');
      }

      disbursement.status = 'cancelled';
      disbursement.cancelledBy = userId;
      disbursement.cancelledAt = new Date();
      disbursement.cancelReason = 'Draft voided';
      await disbursementRepo.save(disbursement);
      await recordAuditEvent(manager, {
        traceId: disbursement.traceId,
        action: 'DELETE',
        targetType: 'MATERIALS_DISBURSEMENT',
        targetId: disbursement.id,
        performedBy: userId,
        departmentId: disbursement.departmentId,
        before: { status: 'draft' },
        after: { status: 'cancelled' },
        reason: 'Draft voided',
      });
    });
  }

  /**
   * CONFIRM: Execute FIFO disbursement for each item.
   *
   * FIFO Logic:
   * 1. For each item, query MaterialReceivingPackage with status='in_stock'
   *    joined with MaterialReceiving for receiveDate, sorted ASC by receiveDate.
   * 2. Loop through packages deducting quantity until requestedQty is fulfilled.
   * 3. Partial packages: update remaining quantity and status stays 'in_stock'.
   *    Fully-used packages: set status to 'issued' and quantity to 0.
   * 4. Create StockTransaction with referenceType='MATERIALS_DISBURSEMENT'.
   * 5. Update StockBalance (decrement total quantity per material).
   */
  async confirm(id: string, userId: string): Promise<MaterialsDisbursement> {
    await this.dataSource.transaction(async (manager) => {
      const disbursementRepo = manager.getRepository(MaterialsDisbursement);
      const disbursement = await disbursementRepo.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });

      if (!disbursement) {
        throw new NotFoundException('Materials disbursement not found');
      }
      if (disbursement.status !== 'draft') {
        throw new ConflictException(
          'Only a draft disbursement can be confirmed',
        );
      }
      if (
        disbursement.disbursementDate > new Date().toISOString().slice(0, 10)
      ) {
        throw new BadRequestException(
          'Disbursement date cannot be in the future',
        );
      }

      const itemRepo = manager.getRepository(MaterialDisbursementItem);
      const items = await itemRepo.find({ where: { disbursementId: id } });

      if (items.length === 0) {
        throw new BadRequestException('No items to disburse');
      }

      // Process each item with FIFO
      for (const item of items) {
        await this.processFifoForItem(manager, item, disbursement, userId);
      }

      // Update disbursement status
      disbursement.status = 'confirmed';
      disbursement.confirmedBy = userId;
      disbursement.confirmedAt = new Date();
      disbursement.approvedBy = userId;
      await disbursementRepo.save(disbursement);
      await recordAuditEvent(manager, {
        traceId: disbursement.traceId,
        action: 'APPROVE',
        targetType: 'MATERIALS_DISBURSEMENT',
        targetId: disbursement.id,
        performedBy: userId,
        departmentId: disbursement.departmentId,
        before: { status: 'draft' },
        after: { status: 'confirmed' },
      });
    });

    return this.findOne(id);
  }

  /**
   * CANCEL: Revert stock balance and restore package quantities if already confirmed.
   */
  async cancel(
    id: string,
    dto: { cancelReason: string },
    userId: string,
  ): Promise<MaterialsDisbursement> {
    await this.dataSource.transaction(async (manager) => {
      const disbursementRepo = manager.getRepository(MaterialsDisbursement);
      const disbursement = await disbursementRepo.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });

      if (!disbursement) {
        throw new NotFoundException('Materials disbursement not found');
      }
      if (disbursement.status === 'cancelled') {
        throw new ConflictException('Materials disbursement already cancelled');
      }
      if (disbursement.materialJobOrderId) {
        // This disbursement was issued from a Material Job Order (a
        // Production Plan's warehouse pick document) — its reservation
        // bookkeeping (issued_quantity, release state) is owned by
        // MaterialJobOrdersService, not this page. Cancelling here would
        // leave that ledger out of sync. See ADR "Job Order disbursements
        // cannot be cancelled from the Disbursement page".
        throw new ConflictException(
          'เอกสารนี้ออกจากใบจัดงาน กรุณายกเลิกที่หน้าใบจัดงานแทน',
        );
      }

      // Capture BEFORE any mutation — otherwise the audit event's `before`
      // state always reports the post-mutation value (a real bug fixed here;
      // see the material-traceability handoff's "Known bug to fix immediately").
      const previousStatus = disbursement.status;

      // If confirmed, revert stock and restore packages
      if (disbursement.status === 'confirmed') {
        const itemRepo = manager.getRepository(MaterialDisbursementItem);
        const items = await itemRepo.find({ where: { disbursementId: id } });

        for (const item of items) {
          await this.revertFifoForItem(manager, item, disbursement, userId);
        }
      }

      disbursement.status = 'cancelled';
      disbursement.cancelledBy = userId;
      disbursement.cancelledAt = new Date();
      disbursement.cancelReason = dto.cancelReason?.trim() ?? null;
      await disbursementRepo.save(disbursement);
      await recordAuditEvent(manager, {
        traceId: disbursement.traceId,
        action: 'CANCEL',
        targetType: 'MATERIALS_DISBURSEMENT',
        targetId: disbursement.id,
        performedBy: userId,
        departmentId: disbursement.departmentId,
        before: { status: previousStatus },
        after: { status: 'cancelled' },
        reason: disbursement.cancelReason,
      });
    });

    return this.findOne(id);
  }

  // ----------------------------------------------------------------- queries

  async findAll(query: ListMaterialsDisbursementQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const queryBuilder = this.createListQuery(query);

    const sortColumn = SORT_COLUMNS[query.sortBy ?? 'disbursementDate'];
    const sortOrder = query.sortOrder === 'asc' ? 'ASC' : 'DESC';

    const [disbursements, totalItems] = await queryBuilder
      .orderBy(sortColumn, sortOrder)
      .addOrderBy('disbursement.id', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      items: disbursements.map((d) => this.toListResponse(d)),
      meta: {
        page,
        limit,
        totalItems,
        totalPages: Math.ceil(totalItems / limit),
      },
    };
  }

  /**
   * รายงานจ่ายออกวัสดุเพื่อสอบกลับ
   * แสดง: เลขที่ใบจ่าย, วันจ่าย, ประเภท, เหตุผล, รายละเอียดวัสดุ,
   *        จำนวนที่เบิก/จ่ายจริง, หน่วย, สถานะ,
   *        lot ต้นทาง (จาก FIFO), วันยืนยัน/ยกเลิก
   */
  async generateReport(query: ReportMaterialsDisbursementQueryDto) {
    const DISBURSEMENT_TYPE_LABELS: Record<string, string> = {
      stock_cut: 'ตัดสต็อก',
      production: 'เบิกเพื่อผลิต',
    };

    const STATUS_LABELS: Record<string, string> = {
      draft: 'แนวปฏิบัติ',
      confirmed: 'ยืนยันแล้ว',
      cancelled: 'ยกเลิก',
    };

    const qb = this.disbursementRepository
      .createQueryBuilder('disbursement')
      .leftJoinAndSelect('disbursement.items', 'items')
      .leftJoinAndSelect('items.material', 'material')
      .leftJoinAndSelect('material.unit', 'unit')
      .leftJoinAndSelect('items.packages', 'itemPackages')
      .leftJoinAndSelect('itemPackages.package', 'receivingPackage')
      .leftJoinAndSelect('receivingPackage.materialReceiving', 'receiving')
      .select([
        'disbursement.id',
        'disbursement.disbursementNo',
        'disbursement.disbursementType',
        'disbursement.disbursementDate',
        'disbursement.reason',
        'disbursement.status',
        'disbursement.confirmedAt',
        'disbursement.cancelledAt',
        'disbursement.cancelReason',
        'disbursement.createdBy',
        'disbursement.createdAt',
        'items.id',
        'items.requestedQuantity',
        'items.disbursedQuantity',
        'items.materialId',
        'material.code',
        'material.name',
        'material.materialType',
        'unit.symbol',
        'receiving.internalLotNo',
      ])
      .orderBy('disbursement.disbursementDate', 'DESC')
      .addOrderBy('disbursement.disbursementNo', 'DESC');

    if (query.startDate) {
      qb.andWhere('disbursement.disbursementDate >= :startDate', {
        startDate: query.startDate,
      });
    }
    if (query.endDate) {
      qb.andWhere('disbursement.disbursementDate <= :endDate', {
        endDate: query.endDate,
      });
    }
    if (query.status) {
      qb.andWhere('disbursement.status = :status', { status: query.status });
    }
    if (query.disbursementType) {
      qb.andWhere('disbursement.disbursementType = :disbursementType', {
        disbursementType: query.disbursementType,
      });
    }

    const rows = await qb.getMany();

    return {
      items: rows.flatMap((d) =>
        (d.items ?? []).map((item) => {
          // รวบรวม lot ที่ถูกหัดจาก FIFO packages
          const sourceLots = (
            (item.packages ?? []) as Array<{
              package?: { materialReceiving?: { internalLotNo: string } };
            }>
          )
            .map((pkg) => pkg.package?.materialReceiving?.internalLotNo)
            .filter(Boolean) as string[];

          return {
            id: d.id,
            disbursementNo: d.disbursementNo,
            disbursementDate: d.disbursementDate,
            disbursementType: d.disbursementType,
            disbursementTypeLabel:
              DISBURSEMENT_TYPE_LABELS[d.disbursementType] ??
              d.disbursementType,
            reason: d.reason,
            materialCode: item.material?.code ?? '',
            materialName: item.material?.name ?? '',
            materialType: item.material?.materialType ?? null,
            requestedQuantity: item.requestedQuantity,
            disbursedQuantity: item.disbursedQuantity,
            unitSymbol: (item.material as any)?.unit?.symbol ?? '',
            status: d.status,
            statusLabel: STATUS_LABELS[d.status] ?? d.status,
            sourceLotNo: sourceLots.length > 0 ? sourceLots.join(', ') : null,
            confirmedAt: d.confirmedAt?.toISOString() ?? null,
            cancelledAt: d.cancelledAt?.toISOString() ?? null,
            cancelReason: d.cancelReason,
            createdBy: d.createdBy,
            createdAt: d.createdAt.toISOString(),
          };
        }),
      ),
      meta: {
        totalItems: rows.reduce((sum, d) => sum + (d.items?.length ?? 0), 0),
        totalDocuments: rows.length,
        generatedAt: new Date().toISOString(),
        filters: query,
      },
    };
  }

  async findOne(id: string): Promise<any> {
    const disbursement = await this.disbursementRepository
      .createQueryBuilder('disbursement')
      .leftJoinAndSelect('disbursement.items', 'items')
      .leftJoinAndSelect('items.material', 'material')
      .where('disbursement.id = :id', { id })
      .getOne();

    if (!disbursement) {
      throw new NotFoundException('Materials disbursement not found');
    }

    // Load packages for each item
    const itemIds = disbursement.items.map((i) => i.id);
    let packages: MaterialDisbursementPackage[] = [];
    if (itemIds.length > 0) {
      packages = await this.packageRecordRepository
        .createQueryBuilder('pkg')
        .leftJoinAndSelect('pkg.package', 'pkgInfo')
        .where('pkg.disbursementItemId IN (:...itemIds)', { itemIds })
        .getMany();
    }

    const packagesByItem = new Map<string, MaterialDisbursementPackage[]>();
    for (const pkg of packages) {
      if (!packagesByItem.has(pkg.disbursementItemId)) {
        packagesByItem.set(pkg.disbursementItemId, []);
      }
      packagesByItem.get(pkg.disbursementItemId)!.push(pkg);
    }

    return this.toDetailResponse(disbursement, packagesByItem);
  }

  async getLookups() {
    const [materials, units] = await Promise.all([
      this.materialRepository
        .createQueryBuilder('material')
        .where('material.isActive = TRUE')
        .orderBy('material.code', 'ASC')
        .getMany(),
      this.unitRepository.find({
        where: { isActive: true },
        order: { code: 'ASC' },
      }),
    ]);

    // Get available stock per material (from StockBalance)
    const balances = await this.stockBalanceRepository.find();
    const stockByMaterial = new Map(
      balances.map((b) => [b.materialId, b.quantity]),
    );

    return {
      disbursementTypes: [
        { value: 'stock_cut', label: 'Stock Cut (ตัดสต็อก)' },
        { value: 'production', label: 'Production (เบิกเพื่อผลิต)' },
      ],
      materials: materials.map((m) => ({
        id: m.id,
        code: m.code,
        name: m.name,
        unitId: m.unitId,
        availableStock: stockByMaterial.get(m.id) ?? '0.0000',
      })),
      units: units.map((u) => ({ id: u.id, code: u.code, nameTh: u.nameTh })),
    };
  }

  // ----------------------------------------------------------------- private helpers

  private async processFifoForItem(
    manager: EntityManager,
    item: MaterialDisbursementItem,
    disbursement: MaterialsDisbursement,
    userId: string,
  ): Promise<void> {
    const requestedQty = toScaled(item.requestedQuantity);
    let remainingQty = requestedQty;

    // Query packages with FIFO (oldest first by receiveDate)
    const packages = await manager
      .getRepository(MaterialReceivingPackage)
      .createQueryBuilder('pkg')
      .leftJoin('pkg.materialReceiving', 'receiving')
      .where(
        `pkg.materialReceivingId IN (
        SELECT mr.id FROM inventory.material_receivings mr
        WHERE mr.material_id = :materialId
      )`,
        { materialId: item.materialId },
      )
      .andWhere('pkg.status IN (:...statuses)', {
        statuses: ['in_stock', 'partial'],
      })
      .orderBy('receiving.receiveDate', 'ASC')
      .addOrderBy('pkg.id', 'ASC')
      // Package rows are the shared concurrency boundary for both ordinary
      // disbursements and Production Plan approval. Lock them before reading
      // reservations so neither path can allocate the same lot concurrently.
      .setLock('pessimistic_write', undefined, ['pkg'])
      .getMany();

    const reservedByPackage = new Map<string, bigint>();
    if (packages.length > 0) {
      // Outstanding = reserved − already-issued (a Job Order can partially
      // consume a reservation via multiple issues without releasing it —
      // see Material Job Orders / Production Plan Reservation §10).
      const reservationRows = (await manager.query(
        `
          SELECT
            material_receiving_package_id AS package_id,
            SUM(reserved_quantity - issued_quantity)::text AS reserved_quantity
          FROM inventory.production_plan_reservations
          WHERE released_at IS NULL
            AND material_receiving_package_id = ANY($1::bigint[])
          GROUP BY material_receiving_package_id
        `,
        [packages.map((pkg) => pkg.id)],
      )) as unknown as Array<{
        package_id: string;
        reserved_quantity: string;
      }>;

      for (const row of reservationRows) {
        reservedByPackage.set(
          String(row.package_id),
          toScaled(row.reserved_quantity),
        );
      }
    }

    const totalAvailable = packages.reduce((sum, pkg) => {
      const remaining = toScaled(pkg.remainingQuantity);
      const reserved = reservedByPackage.get(String(pkg.id)) ?? 0n;
      const available = remaining - reserved;
      return sum + (available > 0n ? available : 0n);
    }, 0n);

    if (totalAvailable < requestedQty) {
      throw new BadRequestException(
        `Insufficient stock for material ${item.materialId}. ` +
          `Requested: ${item.requestedQuantity}, Available: ${fromScaled(totalAvailable)}`,
      );
    }

    const packageRecordRepo = manager.getRepository(
      MaterialDisbursementPackage,
    );
    const packageRepo = manager.getRepository(MaterialReceivingPackage);
    const stockBalanceRepo = manager.getRepository(StockBalance);
    const material = await manager.getRepository(Material).findOne({
      where: { id: item.materialId },
    });

    // Lock and update stock balance
    let balance = await stockBalanceRepo.findOne({
      where: { materialId: item.materialId },
      lock: { mode: 'pessimistic_write' },
    });
    const quantityBefore = balance ? balance.quantity : '0';

    let totalDisbursed = 0n;
    let fifoOrder = 0;

    for (const pkg of packages) {
      if (remainingQty <= 0n) break;

      const pkgQty = toScaled(pkg.remainingQuantity);
      const reservedQty = reservedByPackage.get(String(pkg.id)) ?? 0n;
      const availableQty = pkgQty - reservedQty;
      if (availableQty <= 0n) continue;

      const qtyToDeduct =
        availableQty < remainingQty ? availableQty : remainingQty;
      fifoOrder += 1;

      // Update package — decrement remainingQuantity (the live/current amount
      // in the box). `quantity` is the immutable original box size recorded
      // at receive time and must never be mutated here: doing so both
      // destroys that record and trips the DB's `qty > 0` check constraint
      // the moment a box is fully consumed (remainingQuantity is allowed to
      // reach 0; `quantity` never should).
      const newRemainingQty = fromScaled(pkgQty - qtyToDeduct);
      pkg.remainingQuantity = newRemainingQty;
      pkg.status = newRemainingQty === '0.0000' ? 'issued' : 'partial';
      await packageRepo.save(pkg);

      // Record which package was used
      await packageRecordRepo.save(
        packageRecordRepo.create({
          disbursementItemId: item.id,
          packageId: pkg.id,
          disbursedQuantity: fromScaled(qtyToDeduct),
          fifoOrder,
          reversedAt: null,
          reversedBy: null,
          createdBy: userId,
        }),
      );

      // Get receiving for lot no
      const receiving = await manager.getRepository(MaterialReceiving).findOne({
        where: { id: pkg.materialReceivingId },
      });

      await recordStockMovement(manager, {
        traceId: disbursement.traceId,
        transactionType: 'ISSUE',
        materialId: item.materialId,
        referenceType: 'MATERIALS_DISBURSEMENT',
        referenceId: item.disbursementId,
        referenceLotNo: receiving?.internalLotNo ?? null,
        mainQrId: receiving?.id ?? null,
        subQrId: pkg.id,
        unitId: material?.unitId ?? null,
        departmentId: disbursement.departmentId,
        productionOrder: disbursement.productionOrder,
        referenceNo: disbursement.referenceNo,
        quantityBefore: fromScaled(toScaled(quantityBefore) - totalDisbursed),
        quantityIn: fromScaled(0n),
        quantityOut: fromScaled(qtyToDeduct),
        quantityAfter: fromScaled(
          toScaled(quantityBefore) - totalDisbursed - qtyToDeduct,
        ),
        remark: `FIFO #${fifoOrder} from ${disbursement.disbursementNo}`,
        performedBy: userId,
      });

      remainingQty -= qtyToDeduct;
      totalDisbursed += qtyToDeduct;
    }

    // Update stock balance (decrement)
    const newBalanceQty = fromScaled(toScaled(quantityBefore) - totalDisbursed);
    if (!balance) {
      balance = stockBalanceRepo.create({
        materialId: item.materialId,
        quantity: newBalanceQty,
        lastMovementAt: new Date(),
      });
    } else {
      balance.quantity = newBalanceQty;
      balance.lastMovementAt = new Date();
    }
    await stockBalanceRepo.save(balance);

    // Update item's disbursed quantity
    const itemRepo = manager.getRepository(MaterialDisbursementItem);
    item.disbursedQuantity = fromScaled(totalDisbursed);
    await itemRepo.save(item);
  }

  private async revertFifoForItem(
    manager: EntityManager,
    item: MaterialDisbursementItem,
    disbursement: MaterialsDisbursement,
    userId: string,
  ): Promise<void> {
    // Get all package records for this item
    const packageRecords = await manager
      .getRepository(MaterialDisbursementPackage)
      .find({
        where: { disbursementItemId: item.id, reversedAt: IsNull() },
        order: { fifoOrder: 'ASC', id: 'ASC' },
      });

    const packageRepo = manager.getRepository(MaterialReceivingPackage);
    const stockBalanceRepo = manager.getRepository(StockBalance);
    const material = await manager.getRepository(Material).findOne({
      where: { id: item.materialId },
    });

    let totalRestored = 0n;

    for (const record of packageRecords) {
      const pkg = await packageRepo.findOne({
        where: { id: record.packageId },
      });
      if (!pkg) continue;

      const restoredQty = toScaled(record.disbursedQuantity);
      const currentRemaining = toScaled(pkg.remainingQuantity);
      const originalQty = toScaled(pkg.quantity);

      // Restore remainingQuantity (never `quantity`, the immutable original
      // box size — see processFifoForItem's comment above), clamped to the
      // original amount as a defensive guard against ever exceeding it.
      let newRemaining = currentRemaining + restoredQty;
      if (newRemaining > originalQty) newRemaining = originalQty;
      pkg.remainingQuantity = fromScaled(newRemaining);
      pkg.status = newRemaining >= originalQty ? 'in_stock' : 'partial';
      await packageRepo.save(pkg);

      totalRestored += restoredQty;

      // Get receiving for lot no
      const receiving = await manager.getRepository(MaterialReceiving).findOne({
        where: { id: pkg.materialReceivingId },
      });

      // Get current balance for transaction
      const balance = await stockBalanceRepo.findOne({
        where: { materialId: item.materialId },
        lock: { mode: 'pessimistic_write' },
      });
      const quantityBefore = balance ? balance.quantity : '0';
      const quantityAfter = fromScaled(toScaled(quantityBefore) + restoredQty);

      await recordStockMovement(manager, {
        traceId: disbursement.traceId,
        transactionType: 'CANCEL',
        materialId: item.materialId,
        referenceType: 'MATERIALS_DISBURSEMENT',
        referenceId: item.disbursementId,
        referenceLotNo: receiving?.internalLotNo ?? null,
        mainQrId: receiving?.id ?? null,
        subQrId: pkg.id,
        unitId: material?.unitId ?? null,
        departmentId: disbursement.departmentId,
        productionOrder: disbursement.productionOrder,
        referenceNo: disbursement.referenceNo,
        quantityBefore,
        quantityIn: fromScaled(restoredQty),
        quantityOut: fromScaled(0n),
        quantityAfter,
        reason: disbursement.cancelReason,
        remark: `Cancelled ${disbursement.disbursementNo}: restored ${fromScaled(restoredQty)}`,
        performedBy: userId,
      });

      // Update balance
      if (balance) {
        balance.quantity = quantityAfter;
        balance.lastMovementAt = new Date();
        await stockBalanceRepo.save(balance);
      }

      record.reversedAt = new Date();
      record.reversedBy = userId;
      await manager.getRepository(MaterialDisbursementPackage).save(record);
    }

    // Reflect the reversal on the item's own disbursed-quantity figure too —
    // otherwise a cancelled disbursement's item still reports its original
    // (now-reversed) quantity, which would make the traceability report show
    // stock as "still issued" for a document that was actually cancelled.
    if (totalRestored > 0n) {
      const itemRepo = manager.getRepository(MaterialDisbursementItem);
      item.disbursedQuantity = fromScaled(
        toScaled(item.disbursedQuantity) - totalRestored,
      );
      await itemRepo.save(item);
    }
  }

  private createListQuery(
    query: ListMaterialsDisbursementQueryDto,
  ): SelectQueryBuilder<MaterialsDisbursement> {
    const queryBuilder = this.disbursementRepository
      .createQueryBuilder('disbursement')
      .leftJoinAndSelect('disbursement.items', 'items')
      .leftJoinAndSelect('items.material', 'material');

    if (query.search) {
      queryBuilder.andWhere('disbursement.disbursement_no ILIKE :search', {
        search: `%${query.search}%`,
      });
    }
    if (query.status) {
      queryBuilder.andWhere('disbursement.status = :status', {
        status: query.status,
      });
    }
    if (query.disbursementType) {
      queryBuilder.andWhere(
        'disbursement.disbursement_type = :disbursementType',
        {
          disbursementType: query.disbursementType,
        },
      );
    }
    if (query.disbursementDateFrom) {
      queryBuilder.andWhere(
        'disbursement.disbursement_date >= :disbursementDateFrom',
        {
          disbursementDateFrom: query.disbursementDateFrom,
        },
      );
    }
    if (query.disbursementDateTo) {
      queryBuilder.andWhere(
        'disbursement.disbursement_date <= :disbursementDateTo',
        {
          disbursementDateTo: query.disbursementDateTo,
        },
      );
    }
    if (query.materialId) {
      // `items`/`material` are already left-joined above, so this narrows
      // the SQL result set to rows whose item references this material —
      // no extra join, no N+1. The hydrated `items` array on each returned
      // disbursement will only contain the line(s) for this material, which
      // is the intended "history for this material" scoping used by
      // /materials/pc's "รายการจ่ายออก" action.
      queryBuilder.andWhere('material.id = :materialId', {
        materialId: query.materialId,
      });
    }
    return queryBuilder;
  }

  private async assertActiveMaterial(
    manager: EntityManager,
    materialId: string,
  ): Promise<Material> {
    const material = await manager
      .getRepository(Material)
      .findOne({ where: { id: materialId } });
    if (!material) {
      throw new NotFoundException(`Material ${materialId} not found`);
    }
    if (!material.isActive) {
      throw new BadRequestException(`Material ${materialId} is inactive`);
    }
    return material;
  }

  private toListResponse(disbursement: MaterialsDisbursement) {
    return {
      id: disbursement.id,
      traceId: disbursement.traceId,
      disbursementNo: disbursement.disbursementNo,
      disbursementType: disbursement.disbursementType,
      disbursementDate: disbursement.disbursementDate,
      status: disbursement.status,
      reason: disbursement.reason,
      departmentId: disbursement.departmentId,
      productionOrder: disbursement.productionOrder,
      referenceNo: disbursement.referenceNo,
      requestedBy: disbursement.requestedBy,
      approvedBy: disbursement.approvedBy,
      attachmentUrl: disbursement.attachmentUrl,
      attachmentName: disbursement.attachmentName,
      remark: disbursement.remark,
      confirmedBy: disbursement.confirmedBy,
      confirmedAt: disbursement.confirmedAt,
      cancelledBy: disbursement.cancelledBy,
      cancelledAt: disbursement.cancelledAt,
      cancelReason: disbursement.cancelReason,
      productionPlanId: disbursement.productionPlanId,
      materialJobOrderId: disbursement.materialJobOrderId,
      createdBy: disbursement.createdBy,
      createdAt: disbursement.createdAt,
      updatedAt: disbursement.updatedAt,
      items: disbursement.items
        ? disbursement.items.map((item) => ({
            id: item.id,
            materialId: item.materialId,
            requestedQuantity: item.requestedQuantity,
            disbursedQuantity: item.disbursedQuantity,
            material: item.material
              ? {
                  id: item.material.id,
                  code: item.material.code,
                  name: item.material.name,
                  imagePath: item.material.imagePath,
                }
              : null,
          }))
        : [],
    };
  }

  private toDetailResponse(
    disbursement: MaterialsDisbursement,
    packagesByItem: Map<string, MaterialDisbursementPackage[]>,
  ) {
    return {
      id: disbursement.id,
      traceId: disbursement.traceId,
      disbursementNo: disbursement.disbursementNo,
      disbursementType: disbursement.disbursementType,
      disbursementDate: disbursement.disbursementDate,
      status: disbursement.status,
      reason: disbursement.reason,
      departmentId: disbursement.departmentId,
      productionOrder: disbursement.productionOrder,
      referenceNo: disbursement.referenceNo,
      requestedBy: disbursement.requestedBy,
      approvedBy: disbursement.approvedBy,
      attachmentUrl: disbursement.attachmentUrl,
      attachmentName: disbursement.attachmentName,
      remark: disbursement.remark,
      confirmedBy: disbursement.confirmedBy,
      confirmedAt: disbursement.confirmedAt,
      cancelledBy: disbursement.cancelledBy,
      cancelledAt: disbursement.cancelledAt,
      cancelReason: disbursement.cancelReason,
      productionPlanId: disbursement.productionPlanId,
      materialJobOrderId: disbursement.materialJobOrderId,
      createdBy: disbursement.createdBy,
      createdAt: disbursement.createdAt,
      updatedAt: disbursement.updatedAt,
      items: disbursement.items.map((item) => ({
        id: item.id,
        materialId: item.materialId,
        requestedQuantity: item.requestedQuantity,
        disbursedQuantity: item.disbursedQuantity,
        material: item.material
          ? {
              id: item.material.id,
              code: item.material.code,
              name: item.material.name,
              imagePath: item.material.imagePath,
            }
          : null,
        packages: (packagesByItem.get(item.id) ?? []).map((pkg) => ({
          id: pkg.id,
          packageId: pkg.packageId,
          disbursedQuantity: pkg.disbursedQuantity,
          fifoOrder: pkg.fifoOrder,
          reversedAt: pkg.reversedAt,
          reversedBy: pkg.reversedBy,
          package: pkg.package
            ? {
                id: pkg.package.id,
                lotDetailNo: pkg.package.lotDetailNo,
                quantity: pkg.package.quantity,
                status: pkg.package.status,
              }
            : null,
        })),
      })),
    };
  }
}
