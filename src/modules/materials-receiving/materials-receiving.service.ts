import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import * as QRCode from 'qrcode';
import {
  DataSource,
  EntityManager,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';
import { getAppConfig } from '../../config/app.config';
import { MaterialReceivingLotCounter } from '../../entities/inventory/material-receiving-lot-counter.entity';
import { MaterialReceivingPackage } from '../../entities/inventory/material-receiving-package.entity';
import {
  MaterialReceiving,
  QrPayload,
} from '../../entities/inventory/material-receiving.entity';
import { buildLotDatePart } from './lot-code.util';

/** Package QR Payload — encoded as pipe-delimited string for scan reliability */
import { StockBalance } from '../../entities/inventory/stock-balance.entity';
import { StockTransaction } from '../../entities/inventory/stock-transaction.entity';
import { Material } from '../../entities/master/material.entity';
import { MaterialShape } from '../../entities/master/material.entity';
import { Organization } from '../../entities/master/organization.entity';
import { SupplierMaterial } from '../../entities/master/supplier-material.entity';
import { Supplier } from '../../entities/master/supplier.entity';
import { Unit } from '../../entities/master/unit.entity';
import { CancelMaterialsReceivingDto } from './dto/cancel-materials-receiving.dto';
import { CreateMaterialsReceivingDto } from './dto/create-materials-receiving.dto';
import {
  ListMaterialsReceivingQueryDto,
  MaterialsReceivingSortBy,
} from './dto/list-materials-receiving-query.dto';
import { UpdateMaterialsReceivingDto } from './dto/update-materials-receiving.dto';
import { ReportMaterialsReceivingQueryDto } from './dto/report-materials-receiving.dto';
import {
  UnifiedReportQueryDto,
  UnifiedReportRow,
} from './dto/unified-report.dto';

const SORT_COLUMNS: Record<MaterialsReceivingSortBy, string> = {
  internalLotNo: 'receiving.internalLotNo',
  receiveDate: 'receiving.receiveDate',
  supplierLotNo: 'receiving.supplierLotNo',
  createdAt: 'receiving.createdAt',
  updatedAt: 'receiving.updatedAt',
};

const DECIMAL_SCALE = 4;
/** Internal Lot No. prefix — kept as a fixed literal (not the material's own
 * code) so the lot stays unique across every material received on the same
 * day off one shared, date-only counter (see allocateInternalLotNo below). */
const LOT_PREFIX = 'CCI';
/** Run No. prefix (Material Receiving) — unrelated to Internal Lot No, unchanged */
const RUN_NO_PREFIX = 'MR';
/** QR schema version (เพิ่มเมื่อ contract เปลี่ยน) */
const QR_PAYLOAD_VERSION = '1.0';
/** QR schema version for pieces QR (material type = PIPE / SHEET / COIL) */
const PIECES_QR_PAYLOAD_VERSION = '2.0';

const SUPPLIER_MAPPING_ERROR =
  'Material is not linked to supplier. Link them in Material Master first.';

@Injectable()
export class MaterialsReceivingService implements OnApplicationBootstrap {
  private readonly logger = new Logger(MaterialsReceivingService.name);

  constructor(
    @InjectRepository(MaterialReceiving)
    private readonly receivingRepository: Repository<MaterialReceiving>,
    @InjectRepository(MaterialReceivingPackage)
    private readonly packageRepository: Repository<MaterialReceivingPackage>,
    @InjectRepository(StockBalance)
    private readonly stockBalanceRepository: Repository<StockBalance>,
    @InjectRepository(StockTransaction)
    private readonly stockTransactionRepository: Repository<StockTransaction>,
    @InjectRepository(MaterialReceivingLotCounter)
    private readonly lotCounterRepository: Repository<MaterialReceivingLotCounter>,
    @InjectRepository(Supplier)
    private readonly supplierRepository: Repository<Supplier>,
    @InjectRepository(Material)
    private readonly materialRepository: Repository<Material>,
    @InjectRepository(Unit)
    private readonly unitRepository: Repository<Unit>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Goods Receipt fail fast ที่ bootstrap เพราะ organization_id ต้องตั้งให้ถูก
   * Materials Receiving ใช้ organization_id แบบเดียวกัน จึงตรวจเหมือนกัน
   */
  async onApplicationBootstrap(): Promise<void> {
    const code = getAppConfig().defaultOrganizationCode;
    const organization = await this.dataSource
      .getRepository(Organization)
      .findOne({ where: { code } });
    if (!organization) {
      throw new Error(`Default organization ${code} does not exist`);
    }
    if (!organization.isActive) {
      throw new Error(`Default organization ${code} is inactive`);
    }
  }

  // ---------------------------------------------------------------- commands

  async create(
    dto: CreateMaterialsReceivingDto,
    userId: string,
  ): Promise<MaterialReceiving> {
    this.assertPositiveQuantity(dto.receiveQuantity);
    this.assertReceiveDateNotFuture(dto.receiveDate);

    const result = await this.dataSource.transaction(async (manager) => {
      // 1) Validate active material + derive or validate supplier
      const material = await this.assertActiveMaterial(manager, dto.materialId);
      const supplierId = await this.resolveSupplier(
        manager,
        dto.materialId,
        dto.supplierId,
      );

      // 2) Snapshot material shape + ratio (override-able per receive)
      const materialType = material.materialType ?? null;
      const ratio = dto.ratioOverride ?? material.ratio ?? null;
      if (this.requiresRatio(materialType) && (ratio === null || ratio < 1)) {
        throw new BadRequestException(
          `Material shape ${materialType} requires a ratio. Set ratio on the material or supply ratioOverride.`,
        );
      }

      // 3) Snapshot packing quantity (override หรือจาก master)
      const packingQuantity =
        dto.packingQuantityOverride ?? material.packingQuantity;
      if (
        packingQuantity === null ||
        packingQuantity === undefined ||
        packingQuantity < 1
      ) {
        throw new BadRequestException(
          'Material has no packing quantity. Set packingQuantity on the material or supply packingQuantityOverride.',
        );
      }

      // 4) Calculate package count
      const receiveQuantity = dto.receiveQuantity;
      const packageCount = this.computePackageCount(
        receiveQuantity,
        packingQuantity,
      );
      const packages = this.buildPackageBreakdown(
        receiveQuantity,
        packingQuantity,
        packageCount,
      );

      // 4.5) Calculate piecesQuantity (ชิ้นที่ใช้ได้จริง) — only for PIPE/SHEET/COIL
      const piecesQuantity = this.computePiecesQuantity(
        receiveQuantity,
        materialType,
        ratio,
      );

      // 5) Generate internal lot no (concurrency-safe via lot counter lock)
      const internalLotNo = await this.allocateInternalLotNo(
        manager,
        dto.receiveDate,
      );

      // 6) Generate run no (concurrency-safe)
      const runNo = await this.allocateRunNo(manager, dto.receiveDate);

      // 7) Generate supplier lot no
      const supplierLotNo = this.buildSupplierLotNo(dto.supplierProductionDate);

      // 8) Generate QR payload + base64 PNG (using internalLotNo as primary key)
      const qrPayload: QrPayload = {
        version: QR_PAYLOAD_VERSION,
        internalLotNo,
        materialCode: material.code,
        receiveQuantity,
        supplierLotNo,
      };
      const qrCode = await this.generateQrCode(internalLotNo);

      // 8.5) Generate pieces QR Code (PIPE / SHEET / COIL only)
      const [piecesQrCode, piecesQrPayload] = this.requiresRatio(materialType)
        ? await Promise.all([
            this.generatePiecesQrCode(internalLotNo),
            Promise.resolve({
              version: PIECES_QR_PAYLOAD_VERSION,
              internalLotNo,
              runNo,
              materialCode: material.code,
              piecesQuantity: piecesQuantity!,
              materialType: materialType!,
            } as const),
          ])
        : [null, null];

      // 9) Generate QR codes for each package
      const packageQrCodes = await this.generatePackageQrCodes(
        packages,
        internalLotNo,
      );

      // 10) Snapshot material code/name (เผื่ออนาคต master เปลี่ยน)
      const organizationId = await this.resolveOrganizationId(manager);

      // 11) Save receiving
      const receivingRepository = manager.getRepository(MaterialReceiving);
      const receiving = receivingRepository.create({
        runNo,
        internalLotNo,
        organizationId,
        supplierId,
        materialId: dto.materialId,
        unitId: material.unitId,
        receiveQuantity,
        packingQuantity,
        packageCount,
        supplierLotNo,
        supplierProductionDate: dto.supplierProductionDate,
        receiveDate: dto.receiveDate,
        qrCode,
        qrPayload,
        status: 'draft',
        poNo: dto.poNo ?? null,
        materialType,
        ratio,
        piecesQuantity,
        piecesQrCode,
        piecesQrPayload,
        attachmentUrl: dto.attachmentUrl ?? null,
        attachmentName: dto.attachmentName ?? null,
        remark: dto.remark ?? null,
        createdBy: userId,
        updatedBy: userId,
      });
      const saved = await this.saveReceiving(receivingRepository, receiving);

      // 12) Save package breakdown with LOT-DETAIL and QR codes
      const packageRepository = manager.getRepository(MaterialReceivingPackage);
      const packageRows = packages.map((pkg) => {
        const lotDetailNo = this.buildLotDetailNo(internalLotNo, pkg.packageNo);
        return packageRepository.create({
          materialReceivingId: saved.id,
          packageNo: pkg.packageNo,
          lotDetailNo,
          quantity: pkg.quantity,
          remainingQuantity: pkg.quantity,
          qrCode: packageQrCodes.get(pkg.packageNo) ?? null,
          status: 'pending',
        });
      });
      await packageRepository.save(packageRows);

      return saved;
    });
    return this.findOne(result.id);
  }

  async update(
    id: string,
    dto: UpdateMaterialsReceivingDto,
    userId: string,
  ): Promise<MaterialReceiving> {
    if (dto.receiveQuantity) this.assertPositiveQuantity(dto.receiveQuantity);
    if (dto.receiveDate) this.assertReceiveDateNotFuture(dto.receiveDate);

    await this.dataSource.transaction(async (manager) => {
      const receivingRepository = manager.getRepository(MaterialReceiving);
      const receiving = await receivingRepository.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!receiving) {
        throw new NotFoundException('Material receiving not found');
      }
      if (receiving.status !== 'draft') {
        throw new ConflictException(
          'Only a draft material receiving can be edited',
        );
      }
      if (
        new Date(dto.updatedAt).getTime() !==
        new Date(receiving.updatedAt).getTime()
      ) {
        throw new ConflictException('Material receiving has been updated');
      }

      const material = await this.assertActiveMaterial(
        manager,
        receiving.materialId,
      );
      const supplierId = await this.resolveSupplier(
        manager,
        receiving.materialId,
        dto.supplierId,
      );

      const newReceiveQuantity =
        dto.receiveQuantity ?? receiving.receiveQuantity;
      const packingQuantity =
        dto.packingQuantityOverride ?? receiving.packingQuantity;
      if (packingQuantity < 1) {
        throw new BadRequestException('packingQuantity must be >= 1');
      }
      const packageCount = this.computePackageCount(
        newReceiveQuantity,
        packingQuantity,
      );

      // Recompute materialType/ratio if receiveQuantity or ratioOverride changes
      const newMaterialType =
        receiving.materialType ?? material.materialType ?? null;
      const newRatio =
        dto.ratioOverride !== undefined
          ? dto.ratioOverride
          : (receiving.ratio ?? material.ratio ?? null);
      if (this.requiresRatio(newMaterialType) && (newRatio === null || newRatio < 1)) {
        throw new BadRequestException(
          `Material shape ${newMaterialType} requires a ratio`,
        );
      }
      const newPiecesQuantity = this.computePiecesQuantity(
        newReceiveQuantity,
        newMaterialType,
        newRatio,
      );

      // ถ้าวันที่ supplier ผลิตเปลี่ยน ต้องออก supplier lot ใหม่
      const supplierProductionDate =
        dto.supplierProductionDate ?? receiving.supplierProductionDate;
      const supplierLotNo = supplierProductionDate
        ? this.buildSupplierLotNo(supplierProductionDate)
        : receiving.supplierLotNo;

      if (dto.receiveQuantity || dto.packingQuantityOverride) {
        const packages = this.buildPackageBreakdown(
          newReceiveQuantity,
          packingQuantity,
          packageCount,
        );
        const packageRepository = manager.getRepository(
          MaterialReceivingPackage,
        );
        await packageRepository.delete({ materialReceivingId: id });
        const packageQrCodes = await this.generatePackageQrCodes(
          packages,
          receiving.internalLotNo,
        );
        const packageRows = packages.map((pkg) => {
          const lotDetailNo = this.buildLotDetailNo(
            receiving.internalLotNo,
            pkg.packageNo,
          );
          return packageRepository.create({
            materialReceivingId: id,
            packageNo: pkg.packageNo,
            lotDetailNo,
            quantity: pkg.quantity,
            remainingQuantity: pkg.quantity,
            qrCode: packageQrCodes.get(pkg.packageNo) ?? null,
          });
        });
        await packageRepository.save(packageRows);
      }

      const updatedQrPayload: QrPayload = {
        version: QR_PAYLOAD_VERSION,
        internalLotNo: receiving.internalLotNo,
        materialCode: material.code,
        receiveQuantity: newReceiveQuantity,
        supplierLotNo,
      };
      const qrCode =
        dto.receiveQuantity || dto.packingQuantityOverride
          ? await this.generateQrCode(receiving.internalLotNo)
          : receiving.qrCode;

      // Regenerate pieces QR when piecesQuantity changes or materialType changes
      const needsPiecesQr = this.requiresRatio(newMaterialType);
      const piecesQrChanged =
        dto.receiveQuantity !== undefined ||
        dto.ratioOverride !== undefined ||
        dto.packingQuantityOverride !== undefined ||
        (needsPiecesQr && !this.requiresRatio(receiving.materialType ?? null)) ||
        (!needsPiecesQr && this.requiresRatio(receiving.materialType ?? null));
      const [newPiecesQrCode, newPiecesQrPayload] = needsPiecesQr && piecesQrChanged
        ? await Promise.all([
            this.generatePiecesQrCode(receiving.internalLotNo),
            Promise.resolve({
              version: PIECES_QR_PAYLOAD_VERSION,
              internalLotNo: receiving.internalLotNo,
              runNo: receiving.runNo,
              materialCode: material.code,
              piecesQuantity: newPiecesQuantity!,
              materialType: newMaterialType!,
            } as const),
          ])
        : [receiving.piecesQrCode, receiving.piecesQrPayload];

      receiving.supplierId = supplierId;
      receiving.receiveQuantity = newReceiveQuantity;
      receiving.packingQuantity = packingQuantity;
      receiving.packageCount = packageCount;
      receiving.supplierProductionDate = supplierProductionDate;
      receiving.supplierLotNo = supplierLotNo;
      receiving.receiveDate = dto.receiveDate ?? receiving.receiveDate;
      receiving.poNo = dto.poNo !== undefined ? dto.poNo : receiving.poNo;
      receiving.materialType = newMaterialType;
      receiving.ratio = newRatio;
      receiving.piecesQuantity = newPiecesQuantity;
      receiving.piecesQrCode = newPiecesQrCode;
      receiving.piecesQrPayload = newPiecesQrPayload;
      receiving.attachmentUrl =
        dto.attachmentUrl !== undefined
          ? dto.attachmentUrl
          : receiving.attachmentUrl;
      receiving.attachmentName =
        dto.attachmentName !== undefined
          ? dto.attachmentName
          : receiving.attachmentName;
      receiving.remark =
        dto.remark !== undefined ? dto.remark : receiving.remark;
      receiving.qrPayload = updatedQrPayload;
      receiving.qrCode = qrCode;
      receiving.updatedBy = userId;

      await this.saveReceiving(receivingRepository, receiving);
    });
    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const receiving = await manager
        .getRepository(MaterialReceiving)
        .findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!receiving) {
        throw new NotFoundException('Material receiving not found');
      }
      if (receiving.status !== 'draft') {
        throw new ConflictException(
          'Only a draft material receiving can be deleted',
        );
      }
      await manager.getRepository(MaterialReceiving).delete({ id });
    });
  }

  async confirm(id: string, userId: string): Promise<MaterialReceiving> {
    await this.dataSource.transaction(async (manager) => {
      const receivingRepository = manager.getRepository(MaterialReceiving);
      const receiving = await receivingRepository.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!receiving) {
        throw new NotFoundException('Material receiving not found');
      }
      if (receiving.status !== 'draft') {
        throw new ConflictException(
          'Only a draft material receiving can be confirmed',
        );
      }
      this.assertReceiveDateNotFuture(receiving.receiveDate);

      // ล็อก stock balance แถวของ material นี้ แล้วบวกยอด
      const stockBalanceRepository = manager.getRepository(StockBalance);
      let balance = await stockBalanceRepository.findOne({
        where: { materialId: receiving.materialId },
        lock: { mode: 'pessimistic_write' },
      });
      const quantityBefore = balance ? balance.quantity : '0';
      const quantityAfter = this.addDecimals(
        quantityBefore,
        receiving.receiveQuantity,
      );

      if (!balance) {
        balance = stockBalanceRepository.create({
          materialId: receiving.materialId,
          quantity: quantityAfter,
          lastMovementAt: new Date(),
        });
      } else {
        balance.quantity = quantityAfter;
        balance.lastMovementAt = new Date();
      }
      await stockBalanceRepository.save(balance);

      // บันทึก stock transaction
      const stockTransactionRepository =
        manager.getRepository(StockTransaction);
      const transaction = stockTransactionRepository.create({
        materialId: receiving.materialId,
        transactionType: 'RECEIVE',
        referenceType: 'MATERIAL_RECEIVING',
        referenceId: receiving.id,
        referenceLotNo: receiving.internalLotNo,
        quantityBefore: this.fromScaled(this.toScaled(quantityBefore)),
        quantityIn: this.fromScaled(this.toScaled(receiving.receiveQuantity)),
        quantityOut: this.fromScaled(0n),
        quantityAfter,
        transactionDate: new Date(),
        remark: `Confirmed from receiving ${receiving.internalLotNo}`,
        createdBy: userId,
      });
      await stockTransactionRepository.save(transaction);

      // Update all package status to in_stock
      const packageRepository = manager.getRepository(MaterialReceivingPackage);
      await packageRepository.update(
        { materialReceivingId: id },
        { status: 'in_stock' },
      );

      receiving.status = 'confirmed';
      receiving.confirmedBy = userId;
      receiving.confirmedAt = new Date();
      receiving.updatedBy = userId;
      await this.saveReceiving(receivingRepository, receiving);
    });
    return this.findOne(id);
  }

  async cancel(
    id: string,
    dto: CancelMaterialsReceivingDto,
    userId: string,
  ): Promise<MaterialReceiving> {
    await this.dataSource.transaction(async (manager) => {
      const receivingRepository = manager.getRepository(MaterialReceiving);
      const receiving = await receivingRepository.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!receiving) {
        throw new NotFoundException('Material receiving not found');
      }
      if (receiving.status === 'cancelled') {
        throw new ConflictException('Material receiving already cancelled');
      }

      // ถ้า confirmed แล้ว ต้อง revert stock ก่อน
      if (receiving.status === 'confirmed') {
        const stockBalanceRepository = manager.getRepository(StockBalance);
        const balance = await stockBalanceRepository.findOne({
          where: { materialId: receiving.materialId },
          lock: { mode: 'pessimistic_write' },
        });
        const quantityBefore = balance ? balance.quantity : '0';
        const quantityAfter = this.subtractDecimals(
          quantityBefore,
          receiving.receiveQuantity,
        );
        if (balance) {
          balance.quantity = quantityAfter;
          balance.lastMovementAt = new Date();
          await stockBalanceRepository.save(balance);
        }

        const stockTransactionRepository =
          manager.getRepository(StockTransaction);
        await stockTransactionRepository.save(
          stockTransactionRepository.create({
            materialId: receiving.materialId,
            transactionType: 'ADJUST',
            referenceType: 'MATERIAL_RECEIVING',
            referenceId: receiving.id,
            referenceLotNo: receiving.internalLotNo,
            quantityBefore: this.fromScaled(this.toScaled(quantityBefore)),
            quantityIn: this.fromScaled(0n),
            quantityOut: this.fromScaled(
              this.toScaled(receiving.receiveQuantity),
            ),
            quantityAfter,
            transactionDate: new Date(),
            remark: `Cancelled receiving ${receiving.internalLotNo}: ${dto.cancelReason.trim()}`,
            createdBy: userId,
          }),
        );
      }

      receiving.status = 'cancelled';
      receiving.cancelledBy = userId;
      receiving.cancelledAt = new Date();
      receiving.cancelReason = dto.cancelReason.trim();
      receiving.updatedBy = userId;
      await this.saveReceiving(receivingRepository, receiving);
    });
    return this.findOne(id);
  }

  // ----------------------------------------------------------------- queries

  async findAll(query: ListMaterialsReceivingQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const queryBuilder = this.createListQuery(query);

    const sortColumn = SORT_COLUMNS[query.sortBy] ?? SORT_COLUMNS.receiveDate;
    const sortOrder = query.sortOrder === 'asc' ? 'ASC' : 'DESC';
    const [receivings, totalItems] = await queryBuilder
      .orderBy(sortColumn, sortOrder)
      .addOrderBy('receiving.id', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      items: receivings.map((receiving) => this.toListResponse(receiving)),
      meta: {
        page,
        limit,
        totalItems,
        totalPages: Math.ceil(totalItems / limit),
      },
    };
  }

  /**
   * รายงานรับเข้าวัสดุเพื่อสอบกลับ
   * แสดง: เลขที่ใบรับ, วันรับ, วันผลิต supplier, ชื่อ supplier,
   *        รหัส/ชื่อวัสดุ, ประเภทวัสดุ, จำนวน, หน่วย, จำนวน package, PO, สถานะ
   */
  async generateReport(query: ReportMaterialsReceivingQueryDto) {
    const qb = this.receivingRepository
      .createQueryBuilder('receiving')
      .leftJoinAndSelect('receiving.supplier', 'supplier')
      .leftJoinAndSelect('receiving.material', 'material')
      .leftJoinAndSelect('receiving.organization', 'organization')
      .leftJoinAndSelect('receiving.unit', 'unit')
      .select([
        'receiving.id',
        'receiving.runNo',
        'receiving.internalLotNo',
        'receiving.receiveDate',
        'receiving.supplierProductionDate',
        'receiving.receiveQuantity',
        'receiving.packingQuantity',
        'receiving.packageCount',
        'receiving.poNo',
        'receiving.status',
        'receiving.confirmedAt',
        'receiving.createdBy',
        'receiving.createdAt',
        'supplier.id',
        'supplier.code',
        'supplier.nameTh',
        'supplier.nameEn',
        'material.id',
        'material.code',
        'material.name',
        'material.materialType',
        'organization.id',
        'organization.nameTh',
        'organization.nameEn',
        'unit.id',
        'unit.symbol',
      ])
      .orderBy('receiving.receiveDate', 'DESC')
      .addOrderBy('receiving.internalLotNo', 'DESC');

    if (query.startDate) {
      qb.andWhere('receiving.receiveDate >= :startDate', {
        startDate: query.startDate,
      });
    }
    if (query.endDate) {
      qb.andWhere('receiving.receiveDate <= :endDate', {
        endDate: query.endDate,
      });
    }
    if (query.status) {
      qb.andWhere('receiving.status = :status', { status: query.status });
    }
    if (query.supplierId) {
      qb.andWhere('receiving.supplierId = :supplierId', {
        supplierId: query.supplierId,
      });
    }
    if (query.materialId) {
      qb.andWhere('receiving.materialId = :materialId', {
        materialId: query.materialId,
      });
    }
    if (query.organizationId) {
      qb.andWhere('receiving.organizationId = :organizationId', {
        organizationId: query.organizationId,
      });
    }

    const rows = await qb.getMany();

    return {
      items: rows.map((r) => ({
        id: r.id,
        runNo: r.runNo,
        internalLotNo: r.internalLotNo,
        receiveDate: r.receiveDate,
        supplierProductionDate: r.supplierProductionDate,
        supplierCode: r.supplier?.code ?? '',
        supplierName: r.supplier?.nameTh ?? r.supplier?.nameEn ?? '',
        materialCode: r.material?.code ?? '',
        materialName: r.material?.name ?? '',
        materialType: r.material?.materialType ?? null,
        receiveQuantity: r.receiveQuantity,
        unitSymbol: r.unit?.symbol ?? '',
        packingQuantity: r.packingQuantity,
        packageCount: r.packageCount,
        poNo: r.poNo,
        status: r.status,
        organizationName:
          r.organization?.nameTh ?? r.organization?.nameEn ?? '',
        confirmedAt: r.confirmedAt?.toISOString() ?? null,
        createdBy: r.createdBy,
        createdAt: r.createdAt.toISOString(),
      })),
      meta: {
        totalItems: rows.length,
        generatedAt: new Date().toISOString(),
        filters: query,
      },
    };
  }

  /**
   * รายงานรวม รับเข้า + จ่ายออก วัสดุ
   * แสดง lot ต้นทาง (รับเข้า) และ lot ที่ถูกหัด FIFO (จ่ายออก)
   * วิ่ง raw SQL เพื่อรวมข้อมูลจากทั้งสองตารางใน query เดียว
   *
   * @param query.period — 'today' | 'this_month' | 'this_year' | 'custom'
   *   ถ้า period ถูกตั้ง จะใช้ช่วงวันอัตโนมัติ แทน startDate/endDate
   */
  async generateUnifiedReport(query: UnifiedReportQueryDto) {
    const rows: UnifiedReportRow[] = [];

    // ── Resolve effective date range from period ─────────────────────────────
    const today = new Date();
    let effectiveStartDate = query.startDate;
    let effectiveEndDate = query.endDate;

    if (query.period && query.period !== 'custom') {
      const y = today.getFullYear();
      const m = today.getMonth(); // 0-based

      if (query.period === 'today') {
        const fmt = (d: Date) => d.toISOString().slice(0, 10);
        effectiveStartDate = fmt(today);
        effectiveEndDate = fmt(today);
      } else if (query.period === 'this_month') {
        const start = new Date(y, m, 1);
        const end = new Date(y, m + 1, 0); // last day of month
        effectiveStartDate = start.toISOString().slice(0, 10);
        effectiveEndDate = end.toISOString().slice(0, 10);
      } else if (query.period === 'this_year') {
        effectiveStartDate = `${y}-01-01`;
        effectiveEndDate = `${y}-12-31`;
      }
    }

    const showReceive = !query.type || query.type === 'receive' || query.type === 'both';
    const showDisbursement = !query.type || query.type === 'disbursement' || query.type === 'both';

    const receiveDateCondition = (prefix: string) => {
      const parts: string[] = [];
      const start = effectiveStartDate;
      const end = effectiveEndDate;
      if (start) parts.push(`${prefix}.receive_date >= '${start}'`);
      if (end) parts.push(`${prefix}.receive_date <= '${end}'`);
      return parts.length > 0 ? `AND ${parts.join(' AND ')}` : '';
    };

    const disburseDateCondition = (prefix: string) => {
      const parts: string[] = [];
      // สำหรับ disbursement ใช้ effective dates เดียวกัน หรือ custom ถ้าระบุแยก
      const start = query.startDateDisbursement ?? effectiveStartDate;
      const end = query.endDateDisbursement ?? effectiveEndDate;
      if (start) parts.push(`${prefix}.disbursement_date >= '${start}'`);
      if (end) parts.push(`${prefix}.disbursement_date <= '${end}'`);
      return parts.length > 0 ? `AND ${parts.join(' AND ')}` : '';
    };

    const materialCondition = (matAlias: string) =>
      query.materialId
        ? `AND ${matAlias}.id = '${query.materialId}'`
        : '';

    // ── 1) Receiving rows ─────────────────────────────────────────────────────
    if (showReceive) {
      const receiveSql = `
        SELECT
          'receive' AS "docType",
          mr.receive_date::TEXT AS "docDate",
          mr.internal_lot_no AS "docNo",
          m.code AS "materialCode",
          m.name AS "materialName",
          mr.material_type::TEXT AS "materialType",
          COALESCE(u.symbol::TEXT, '') AS "unitSymbol",
          mr.receive_quantity::TEXT AS "quantityIn",
          NULL::TEXT AS "quantityOut",
          COALESCE(mr.supplier_production_date::TEXT, '') AS "subLabel",
          NULL::TEXT AS "sourceLotNo",
          COALESCE(mr.po_no, '') AS "poNo",
          COALESCE(s.name_th, '') AS "supplierName",
          mr.status,
          CASE mr.status
            WHEN 'draft' THEN 'ฉบับร่าง'
            WHEN 'confirmed' THEN 'ยืนยันแล้ว'
            WHEN 'cancelled' THEN 'ยกเลิก'
            ELSE mr.status
          END AS "statusLabel"
        FROM inventory.material_receivings mr
        LEFT JOIN master.materials m ON m.id = mr.material_id
        LEFT JOIN master.units u ON u.id = mr.unit_id
        LEFT JOIN master.suppliers s ON s.id = mr.supplier_id
        WHERE 1=1 ${receiveDateCondition('mr')} ${materialCondition('m')}
        ORDER BY mr.receive_date DESC, mr.internal_lot_no DESC
      `;
      const receiveRows = await this.dataSource.query(receiveSql);
      rows.push(...receiveRows);
    }

    // ── 2) Disbursement rows ─────────────────────────────────────────────────
    if (showDisbursement) {
      // Aggregate: one row per disbursement document (one material per doc)
      // If a doc has multiple materials, pick the primary one with highest qty
      const disburseSql = `
        SELECT
          'disbursement' AS "docType",
          md.disbursement_date::TEXT AS "docDate",
          md.disbursement_no AS "docNo",
          COALESCE(agg.material_code, '') AS "materialCode",
          COALESCE(agg.material_name, '') AS "materialName",
          COALESCE(agg.material_type::TEXT, '') AS "materialType",
          COALESCE(agg.unit_symbol::TEXT, '') AS "unitSymbol",
          NULL::TEXT AS "quantityIn",
          COALESCE(agg.total_quantity_out, 0)::TEXT AS "quantityOut",
          CASE md.disbursement_type
            WHEN 'stock_cut' THEN 'ตัดสต็อก'
            WHEN 'production' THEN 'เบิกเพื่อผลิต'
            ELSE md.disbursement_type
          END AS "subLabel",
          COALESCE(agg.source_lots, '') AS "sourceLotNo",
          COALESCE(md.reason, '') AS "poNo",
          '' AS "supplierName",
          md.status,
          CASE md.status
            WHEN 'draft' THEN 'ฉบับร่าง'
            WHEN 'confirmed' THEN 'ยืนยันแล้ว'
            WHEN 'cancelled' THEN 'ยกเลิก'
            ELSE md.status
          END AS "statusLabel"
        FROM inventory.materials_disbursements md
        LEFT JOIN LATERAL (
          SELECT
            m.code AS material_code,
            m.name AS material_name,
            m.material_type,
            u.symbol AS unit_symbol,
            SUM(mdi.disbursed_quantity) AS total_quantity_out,
            STRING_AGG(DISTINCT mrpkg.source_lot, ', ' ORDER BY mrpkg.source_lot) AS source_lots
          FROM inventory.material_disbursement_items mdi
          JOIN master.materials m ON m.id = mdi.material_id
          LEFT JOIN master.units u ON u.id = m.unit_id
          LEFT JOIN LATERAL (
            SELECT DISTINCT mr.internal_lot_no AS source_lot
            FROM inventory.material_disbursement_packages mdp2
            JOIN inventory.material_receiving_packages mrp2 ON mrp2.id = mdp2.package_id
            JOIN inventory.material_receivings mr ON mr.id = mrp2.material_receiving_id
            WHERE mdp2.disbursement_item_id = mdi.id
          ) mrpkg ON TRUE
          WHERE mdi.disbursement_id = md.id
            ${materialCondition('m')}
          GROUP BY m.id, m.code, m.name, m.material_type, u.symbol
        ) agg ON TRUE
        WHERE 1=1 ${disburseDateCondition('md')}
          AND agg.material_code IS NOT NULL
        ORDER BY md.disbursement_date DESC, md.disbursement_no DESC
      `;
      const disburseRows = await this.dataSource.query(disburseSql);
      rows.push(...disburseRows);
    }

    // Sort combined rows by date desc, then doc no desc (handle nulls)
    rows.sort((a, b) => {
      const aDate = a.docDate ?? '';
      const bDate = b.docDate ?? '';
      const dateCompare = bDate.localeCompare(aDate);
      if (dateCompare !== 0) return dateCompare;
      const aNo = a.docNo ?? '';
      const bNo = b.docNo ?? '';
      return bNo.localeCompare(aNo);
    });

    return {
      items: rows,
      meta: {
        totalItems: rows.length,
        totalReceive: rows.filter((r) => r.docType === 'receive').length,
        totalDisbursement: rows.filter((r) => r.docType === 'disbursement').length,
        generatedAt: new Date().toISOString(),
        filters: query,
      },
    };
  }

  async findOne(
    id: string,
    manager?: EntityManager,
  ): Promise<
    MaterialReceiving & {
      packages: MaterialReceivingPackage[];
    }
  > {
    const receivingRepo = manager
      ? manager.getRepository(MaterialReceiving)
      : this.receivingRepository;
    const packageRepo = manager
      ? manager.getRepository(MaterialReceivingPackage)
      : this.packageRepository;
    const receiving = await receivingRepo
      .createQueryBuilder('receiving')
      .leftJoinAndSelect('receiving.supplier', 'supplier')
      .leftJoinAndSelect('receiving.organization', 'organization')
      .leftJoinAndSelect('receiving.material', 'material')
      .leftJoinAndSelect('receiving.unit', 'unit')
      .where('receiving.id = :id', { id })
      .getOne();
    if (!receiving) {
      throw new NotFoundException('Material receiving not found');
    }
    const packages = await packageRepo.find({
      where: { materialReceivingId: id },
      order: { packageNo: 'ASC' },
    });
    return Object.assign(receiving, { packages });
  }

  async findByInternalLotNo(
    internalLotNo: string,
  ): Promise<MaterialReceiving | null> {
    return this.receivingRepository.findOne({ where: { internalLotNo } });
  }

  /**
   * Scan-a-box lookup — a package's printed QR encodes only its
   * `lotDetailNo` (see generatePackageQrCodes below), never the mutable
   * tracking fields themselves, so a scan must query the database for the
   * latest data. Returns exactly the tracking fields the box's QR is meant
   * to resolve to (material, both lot numbers, box number, initial/current
   * qty, unit, receive/production dates, status).
   */
  async findPackageByLotDetailNo(lotDetailNo: string) {
    const pkg = await this.packageRepository.findOne({
      where: { lotDetailNo },
    });
    if (!pkg) {
      throw new NotFoundException(`Package ${lotDetailNo} not found`);
    }
    const receiving = await this.receivingRepository
      .createQueryBuilder('receiving')
      .leftJoinAndSelect('receiving.material', 'material')
      .leftJoinAndSelect('receiving.unit', 'unit')
      .where('receiving.id = :id', { id: pkg.materialReceivingId })
      .getOne();
    if (!receiving) {
      throw new NotFoundException(
        `Material receiving for package ${lotDetailNo} not found`,
      );
    }
    return {
      packageId: pkg.id,
      packageNo: pkg.packageNo,
      lotDetailNo: pkg.lotDetailNo,
      materialId: receiving.materialId,
      materialCode: receiving.material?.code ?? '',
      materialName: receiving.material?.name ?? '',
      internalLotNo: receiving.internalLotNo,
      supplierLotNo: receiving.supplierLotNo,
      initialQuantity: pkg.quantity,
      currentQuantity: pkg.remainingQuantity,
      unitSymbol: receiving.unit?.symbol ?? '',
      receiveDate: receiving.receiveDate,
      supplierProductionDate: receiving.supplierProductionDate,
      status: pkg.status,
    };
  }

  /**
   * Return the base64 QR code for a specific package.
   */
  async getPackageQrCode(packageId: string): Promise<string | null> {
    const pkg = await this.packageRepository.findOne({ where: { id: packageId } });
    return pkg?.qrCode ?? null;
  }

  /**
   * Return the base64 pieces QR code for a material receiving.
   * Only exists for material_type = PIPE / SHEET / COIL.
   */
  async getPiecesQrCode(id: string): Promise<string | null> {
    const receiving = await this.receivingRepository.findOne({ where: { id } });
    return receiving?.piecesQrCode ?? null;
  }

  /**
   * Return active suppliers linked to a given material.
   * Used by the frontend to determine if supplierId is required in the create form.
   *
   * Returns `{ id, code, nameTh, nameEn }` to stay consistent with the
   * frontend `MaterialsReceivingSupplier` interface (which uses `id`,
   * matching the convention used by Material / Unit / MaterialSupplier).
   */
  async getSuppliersByMaterial(materialId: string) {
    await this.assertActiveMaterial(this.receivingRepository.manager, materialId);
    const mappings = await this.receivingRepository.manager
      .getRepository(SupplierMaterial)
      .find({
        where: { materialId, isActive: true },
        relations: ['supplier'],
        order: { supplier: { code: 'ASC' } },
      });

    return mappings.map((m) => ({
      id: m.supplier.id,
      code: m.supplier.code,
      nameTh: m.supplier.nameTh,
      nameEn: m.supplier.nameEn,
    }));
  }

  async getMaterialLookups() {
    const [suppliers, materials, units] = await Promise.all([
      this.supplierRepository.find({
        where: { isActive: true },
        order: { code: 'ASC' },
      }),
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
    return {
      suppliers: suppliers.map((s) => this.toLookup(s)),
      materials: materials.map((m) => ({
        id: m.id,
        code: m.code,
        name: m.name,
        packingQuantity: m.packingQuantity,
        materialType: m.materialType ?? null,
        ratio: m.ratio ?? null,
        unitId: m.unitId,
        unit: m.unitId,
      })),
      units: units.map((u) => this.toLookup(u)),
    };
  }

  // ----------------------------------------------------------------- helpers

  private createListQuery(
    query: ListMaterialsReceivingQueryDto,
  ): SelectQueryBuilder<MaterialReceiving> {
    const queryBuilder = this.receivingRepository
      .createQueryBuilder('receiving')
      .leftJoinAndSelect('receiving.supplier', 'supplier')
      .leftJoinAndSelect('receiving.material', 'material')
      .leftJoinAndSelect('receiving.packages', 'packages');
    if (query.search) {
      queryBuilder.andWhere(
        '(receiving.internal_lot_no ILIKE :search OR receiving.supplier_lot_no ILIKE :search OR material.code ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }
    if (query.status) {
      queryBuilder.andWhere('receiving.status = :status', {
        status: query.status,
      });
    }
    if (query.supplierId) {
      queryBuilder.andWhere('receiving.supplier_id = :supplierId', {
        supplierId: query.supplierId,
      });
    }
    if (query.materialId) {
      queryBuilder.andWhere('receiving.material_id = :materialId', {
        materialId: query.materialId,
      });
    }
    if (query.internalLotNo) {
      queryBuilder.andWhere('receiving.internal_lot_no = :internalLotNo', {
        internalLotNo: query.internalLotNo,
      });
    }
    if (query.receiveDateFrom) {
      queryBuilder.andWhere('receiving.receive_date >= :receiveDateFrom', {
        receiveDateFrom: query.receiveDateFrom,
      });
    }
    if (query.receiveDateTo) {
      queryBuilder.andWhere('receiving.receive_date <= :receiveDateTo', {
        receiveDateTo: query.receiveDateTo,
      });
    }
    if (query.hasPackages !== undefined) {
      const clause = `EXISTS (
        SELECT 1 FROM inventory.material_receiving_packages pkg
        WHERE pkg.material_receiving_id = receiving.id
      )`;
      queryBuilder.andWhere(query.hasPackages ? clause : `NOT ${clause}`);
    }
    return queryBuilder;
  }

  /**
   * จัดสรร Run No. แบบ MR-YYYYMMDD-XXXX
   * - ใช้ lot counter เดียวกันกับ internal lot เพื่อความง่าย
   * - Running number reset ทุกวัน
   */
  private async allocateRunNo(
    manager: EntityManager,
    receiveDate: string,
  ): Promise<string> {
    const counterRepository = manager.getRepository(
      MaterialReceivingLotCounter,
    );
    const where = { lotDate: receiveDate };
    let counter = await counterRepository.findOne({
      where,
      lock: { mode: 'pessimistic_write' },
    });
    if (!counter) {
      await manager.query(
        `INSERT INTO inventory.material_receiving_lot_counters
           (lot_date, last_number)
         VALUES ($1, 0)
         ON CONFLICT (lot_date) DO NOTHING`,
        [receiveDate],
      );
      counter = await counterRepository.findOne({
        where,
        lock: { mode: 'pessimistic_write' },
      });
    }
    if (!counter) {
      throw new ConflictException('Failed to allocate run number');
    }
    counter.lastNumber += 1;
    await counterRepository.save(counter);
    const datePart = receiveDate.replace(/-/g, '');
    return `${RUN_NO_PREFIX}-${datePart}-${String(counter.lastNumber).padStart(4, '0')}`;
  }

  /**
   * จัดสรร Internal Lot No. แบบ CCI-{YY}{MonthCode}{DD}-{SEQ} เช่น CCI-26J07-001
   * (ดู lot-code.util.ts สำหรับ MonthCode mapping — ตัด "E" ออกโดยตั้งใจ)
   * - Prefix "CCI" เป็นค่าคงที่ ไม่ใช่รหัสวัสดุ เพื่อให้ยังใช้ตัวนับกลาง
   *   (material_receiving_lot_counters) ตัวเดียวกับ run_no ได้ — Sequence
   *   แยกตาม "วันที่รับเข้า" อย่างเดียว (ไม่แยกตาม material) จึงรับประกัน
   *   lot ไม่ซ้ำข้ามวัสดุที่รับเข้าวันเดียวกันด้วย
   * - ใช้ lock แบบ SELECT FOR UPDATE กัน duplicate แม้มี request เข้าพร้อมกัน
   * - UNIQUE constraint บน internal_lot_no เป็น defense in depth เพิ่มเติม
   */
  private async allocateInternalLotNo(
    manager: EntityManager,
    receiveDate: string,
  ): Promise<string> {
    const counterRepository = manager.getRepository(
      MaterialReceivingLotCounter,
    );
    const where = { lotDate: receiveDate };
    let counter = await counterRepository.findOne({
      where,
      lock: { mode: 'pessimistic_write' },
    });
    if (!counter) {
      // Insert-if-missing — กัน race ที่สอง transaction เริ่มพร้อมกัน
      await manager.query(
        `INSERT INTO inventory.material_receiving_lot_counters
           (lot_date, last_number)
         VALUES ($1, 0)
         ON CONFLICT (lot_date) DO NOTHING`,
        [receiveDate],
      );
      counter = await counterRepository.findOne({
        where,
        lock: { mode: 'pessimistic_write' },
      });
    }
    if (!counter) {
      throw new ConflictException('Failed to allocate internal lot number');
    }
    counter.lastNumber += 1;
    await counterRepository.save(counter);
    return `${LOT_PREFIX}-${buildLotDatePart(receiveDate)}-${String(counter.lastNumber).padStart(3, '0')}`;
  }

  /**
   * Build Supplier Lot No. format: {YY}{MonthCode}{DD} เช่น 26J07
   * ไม่มี prefix, ไม่มี running number — deterministic จากวันที่ supplier
   * ผลิตเท่านั้น จึง receive หลายครั้งในวันที่ supplier ผลิตเดียวกันได้
   * supplier lot เดียวกัน (ต่างจาก internal lot ที่ต้องไม่ซ้ำเสมอ)
   */
  private buildSupplierLotNo(productionDate: string): string {
    return buildLotDatePart(productionDate);
  }

  /**
   * Build LOT-CCI-DETAIL for each package.
   * Format: {LOT_HEADER}-{PKGNO}  (3-digit package)
   * e.g. CCI-2026H1200001-001
   */
  private buildLotDetailNo(internalLotNo: string, packageNo: number): string {
    return `${internalLotNo}-${String(packageNo).padStart(3, '0')}`;
  }

  /**
   * Resolve supplierId from DTO:
   * - If supplied, validate it exists and is linked to the material.
   * - If omitted, auto-derive from material's supplier list:
   *   - 1 match → use it (default)
   *   - 0 matches → throw
   *   - 2+ matches → throw (frontend must pick one)
   */
  private async resolveSupplier(
    manager: EntityManager,
    materialId: string,
    supplierId?: string,
  ): Promise<string> {
    if (supplierId) {
      await this.assertActiveSupplier(manager, supplierId);
      await this.assertSupplierMaterialMapping(manager, materialId, supplierId);
      return supplierId;
    }

    const mappings = await manager.getRepository(SupplierMaterial).find({
      where: { materialId, isActive: true },
    });

    if (mappings.length === 0) {
      throw new BadRequestException(SUPPLIER_MAPPING_ERROR);
    }
    if (mappings.length > 1) {
      throw new BadRequestException(
        `Material has ${mappings.length} active suppliers. Please specify supplierId explicitly.`,
      );
    }
    return mappings[0].supplierId;
  }

  /** packageCount = CEIL(receiveQuantity / packingQuantity) */
  private computePackageCount(
    receiveQuantity: string,
    packingQuantity: number,
  ): number {
    if (packingQuantity < 1) {
      throw new BadRequestException('packingQuantity must be >= 1');
    }
    const qty =
      Number(this.toScaled(receiveQuantity)) / Math.pow(10, DECIMAL_SCALE);
    return Math.ceil(qty / packingQuantity);
  }

  /** Material shapes that require a `ratio` value (cut per piece). */
  private requiresRatio(materialType: string | null): boolean {
    return (
      materialType === MaterialShape.PIPE ||
      materialType === MaterialShape.SHEET ||
      materialType === MaterialShape.COIL
    );
  }

  /**
   * คำนวณจำนวนชิ้นที่ใช้ได้จริง (piecesQuantity)
   *   - PCS  → null (1 ชิ้น = 1 ชิ้น, ใช้ receiveQuantity แทน)
   *   - PIPE / SHEET / COIL → receiveQuantity × ratio (เก็บทั้งต้นทางและชิ้นสุดท้าย)
   * คืนเป็น string ที่ scaled ตาม DECIMAL_SCALE เพื่อเก็บใน numeric column
   */
  private computePiecesQuantity(
    receiveQuantity: string,
    materialType: string | null,
    ratio: number | null,
  ): string | null {
    if (!this.requiresRatio(materialType)) {
      return null;
    }
    if (ratio === null || ratio < 1) {
      throw new BadRequestException(
        `Cannot compute piecesQuantity without a valid ratio for materialType=${materialType}`,
      );
    }
    const qty =
      Number(this.toScaled(receiveQuantity)) / Math.pow(10, DECIMAL_SCALE);
    const pieces = qty * ratio;
    return pieces.toFixed(DECIMAL_SCALE);
  }

  /**
   * คำนวณ breakdown: package 1..N-1 เต็ม packingQuantity, package สุดท้ายเอาเศษ
   * SUM(package.quantity) === receiveQuantity เสมอ
   */
  private buildPackageBreakdown(
    receiveQuantity: string,
    packingQuantity: number,
    packageCount: number,
  ): { packageNo: number; quantity: string }[] {
    const total =
      Number(this.toScaled(receiveQuantity)) / Math.pow(10, DECIMAL_SCALE);
    const fullQty = packingQuantity;
    const packages: { packageNo: number; quantity: string }[] = [];
    let remaining = total;
    for (let i = 1; i <= packageCount; i += 1) {
      const value =
        i === packageCount ? remaining : Math.min(fullQty, remaining);
      packages.push({ packageNo: i, quantity: value.toFixed(DECIMAL_SCALE) });
      remaining -= value;
    }
    return packages;
  }

  private async generateQrCode(internalLotNo: string): Promise<string> {
    try {
      return await QRCode.toDataURL(internalLotNo, {
        errorCorrectionLevel: 'M',
        margin: 1,
        scale: 6,
        type: 'image/png',
      });
    } catch (error) {
      this.logger.error(
        `Failed to generate QR code for ${internalLotNo}`,
        error as Error,
      );
      throw new BadRequestException('Failed to generate QR code');
    }
  }

  /**
   * Generate pieces QR Code for PIPE / SHEET / COIL materials.
   * Encodes internalLotNo (same as main QR) — pieces-specific metadata
   * is carried in piecesQrPayload so scanners can differentiate.
   */
  private async generatePiecesQrCode(internalLotNo: string): Promise<string> {
    try {
      return await QRCode.toDataURL(internalLotNo, {
        errorCorrectionLevel: 'M',
        margin: 1,
        scale: 6,
        type: 'image/png',
      });
    } catch (error) {
      this.logger.error(
        `Failed to generate pieces QR code for ${internalLotNo}`,
        error as Error,
      );
      throw new BadRequestException('Failed to generate pieces QR code');
    }
  }

  /**
   * Generate QR codes for all packages.
   * Each package QR encodes only its LOT-CCI-DETAIL (e.g. CCI-2026H1200001-001),
   * using the same plain-text generation as the header QR.
   */
  private async generatePackageQrCodes(
    packages: { packageNo: number; quantity: string }[],
    internalLotNo: string,
  ): Promise<Map<number, string>> {
    const qrCodes = new Map<number, string>();
    try {
      for (const pkg of packages) {
        const lotDetailNo = this.buildLotDetailNo(internalLotNo, pkg.packageNo);
        const qrCode = await this.generateQrCode(lotDetailNo);
        qrCodes.set(pkg.packageNo, qrCode);
      }
    } catch (error) {
      this.logger.error(
        `Failed to generate package QR codes for ${internalLotNo}`,
        error as Error,
      );
      throw new BadRequestException('Failed to generate package QR codes');
    }
    return qrCodes;
  }

  private assertPositiveQuantity(quantity: string): void {
    if (this.toScaled(quantity) === 0n) {
      throw new BadRequestException('receiveQuantity must be greater than 0');
    }
  }

  private assertReceiveDateNotFuture(receiveDate: string): void {
    const today = new Date().toISOString().slice(0, 10);
    if (receiveDate > today) {
      throw new BadRequestException('receiveDate cannot be in the future');
    }
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

  private async assertActiveSupplier(
    manager: EntityManager,
    supplierId: string,
  ): Promise<void> {
    const supplier = await manager
      .getRepository(Supplier)
      .findOne({ where: { id: supplierId } });
    if (!supplier) {
      throw new NotFoundException(`Supplier ${supplierId} not found`);
    }
    if (!supplier.isActive) {
      throw new BadRequestException(`Supplier ${supplierId} is inactive`);
    }
  }

  private async assertSupplierMaterialMapping(
    manager: EntityManager,
    materialId: string,
    supplierId: string,
  ): Promise<void> {
    const mapping = await manager.getRepository(SupplierMaterial).findOne({
      where: { materialId, supplierId, isActive: true },
    });
    if (!mapping) {
      throw new BadRequestException(SUPPLIER_MAPPING_ERROR);
    }
  }

  private async resolveOrganizationId(manager: EntityManager): Promise<string> {
    const code = getAppConfig().defaultOrganizationCode;
    const organization = await manager
      .getRepository(Organization)
      .findOne({ where: { code } });
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

  private async saveReceiving(
    repository: Repository<MaterialReceiving>,
    receiving: MaterialReceiving,
  ): Promise<MaterialReceiving> {
    try {
      return await repository.save(receiving);
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException(
          'A material receiving with this internal lot no or idempotency key already exists',
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

  /** แปลง NUMERIC(18,4) เป็น bigint * 10^4 เพื่อบวก/ลบแบบไม่เสียความละเอียด */
  private toScaled(value: string): bigint {
    const [integerPart, fractionPart = ''] = value.split('.');
    const fraction = `${fractionPart}0000`.slice(0, DECIMAL_SCALE);
    return BigInt(`${integerPart}${fraction}`);
  }

  private fromScaled(scaled: bigint): string {
    const isNegative = scaled < 0n;
    const abs = isNegative ? -scaled : scaled;
    const str = abs.toString().padStart(DECIMAL_SCALE + 1, '0');
    const integerPart = str.slice(0, str.length - DECIMAL_SCALE) || '0';
    const fractionPart = str.slice(str.length - DECIMAL_SCALE);
    const result = `${integerPart}.${fractionPart}`;
    return isNegative ? `-${result}` : result;
  }

  private addDecimals(a: string, b: string): string {
    return this.fromScaled(this.toScaled(a) + this.toScaled(b));
  }

  private subtractDecimals(a: string, b: string): string {
    return this.fromScaled(this.toScaled(a) - this.toScaled(b));
  }

  private toListResponse(receiving: MaterialReceiving) {
    return {
      id: receiving.id,
      runNo: receiving.runNo,
      internalLotNo: receiving.internalLotNo,
      organizationId: receiving.organizationId,
      supplierId: receiving.supplierId,
      materialId: receiving.materialId,
      unitId: receiving.unitId,
      receiveQuantity: receiving.receiveQuantity,
      packingQuantity: receiving.packingQuantity,
      packageCount: receiving.packageCount,
      piecesQuantity: receiving.piecesQuantity,
      supplierLotNo: receiving.supplierLotNo,
      supplierProductionDate: receiving.supplierProductionDate,
      receiveDate: receiving.receiveDate,
      status: receiving.status,
      poNo: receiving.poNo,
      materialType: receiving.materialType,
      ratio: receiving.ratio,
      piecesQrCode: receiving.piecesQrCode,
      piecesQrPayload: receiving.piecesQrPayload,
      attachmentUrl: receiving.attachmentUrl,
      attachmentName: receiving.attachmentName,
      remark: receiving.remark,
      confirmedBy: receiving.confirmedBy,
      confirmedAt: receiving.confirmedAt,
      cancelledBy: receiving.cancelledBy,
      cancelledAt: receiving.cancelledAt,
      cancelReason: receiving.cancelReason,
      createdBy: receiving.createdBy,
      updatedBy: receiving.updatedBy,
      createdAt: receiving.createdAt,
      updatedAt: receiving.updatedAt,
      supplier: receiving.supplier ? this.toLookup(receiving.supplier) : null,
      material: receiving.material
        ? {
            id: receiving.material.id,
            code: receiving.material.code,
            name: receiving.material.name,
            imagePath: receiving.material.imagePath,
          }
        : null,
      packages: receiving.packages
        ? receiving.packages.map((pkg) => ({
            id: pkg.id,
            packageNo: pkg.packageNo,
            lotDetailNo: pkg.lotDetailNo,
            quantity: pkg.quantity,
            remainingQuantity: pkg.remainingQuantity,
            qrCode: pkg.qrCode,
            status: pkg.status,
          }))
        : null,
    };
  }

  private toLookup(entity: {
    id: string;
    code: string;
    nameTh?: string;
    nameEn?: string | null;
    symbol?: string | null;
  }) {
    const result: Record<string, unknown> = {
      id: entity.id,
      code: entity.code,
    };
    if ('nameTh' in entity) result.nameTh = entity.nameTh;
    if ('nameEn' in entity) result.nameEn = entity.nameEn;
    if ('symbol' in entity) result.symbol = entity.symbol;
    return result;
  }
}
