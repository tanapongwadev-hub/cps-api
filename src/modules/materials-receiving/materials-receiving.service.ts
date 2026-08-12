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

/** Package QR Payload — encoded as pipe-delimited string for scan reliability */
import { StockBalance } from '../../entities/inventory/stock-balance.entity';
import { StockTransaction } from '../../entities/inventory/stock-transaction.entity';
import { Material } from '../../entities/master/material.entity';
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

const SORT_COLUMNS: Record<MaterialsReceivingSortBy, string> = {
  internalLotNo: 'receiving.internalLotNo',
  receiveDate: 'receiving.receiveDate',
  supplierLotNo: 'receiving.supplierLotNo',
  createdAt: 'receiving.createdAt',
  updatedAt: 'receiving.updatedAt',
};

const DECIMAL_SCALE = 4;
/** Internal Lot No. prefix */
const LOT_PREFIX = 'CCI';
/** Supplier Lot No. prefix */
const SUPPLIER_LOT_PREFIX = 'SUP';
/** Run No. prefix (Material Receiving) */
const RUN_NO_PREFIX = 'MR';
/** QR schema version (เพิ่มเมื่อ contract เปลี่ยน) */
const QR_PAYLOAD_VERSION = '1.0';

const SUPPLIER_MAPPING_ERROR =
  'Material is not linked to supplier. Link them in Material Master first.';

/**
 * Month → letter mapping for LOT codes.
 * 1=A, 2=B, 3=C, 4=D, 5=E, 6=F, 7=G, 8=H, 9=I, 10=J, 11=K, 12=L
 */
const MONTH_LETTER_MAP: Record<number, string> = {
  1: 'A',
  2: 'B',
  3: 'C',
  4: 'D',
  5: 'E',
  6: 'F',
  7: 'G',
  8: 'H',
  9: 'I',
  10: 'J',
  11: 'K',
  12: 'L',
};

/**
 * Build the date-portion of a LOT code.
 * e.g. "2026-08-13" → "2026H13"
 */
function lotDatePart(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const monthLetter = MONTH_LETTER_MAP[month] ?? String(month);
  return `${year}${monthLetter}${String(day).padStart(2, '0')}`;
}

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
      // 1) Idempotency: ถ้าเคยสร้างด้วย key นี้แล้ว คืนของเดิม
      if (dto.idempotencyKey) {
        const existing = await manager
          .getRepository(MaterialReceiving)
          .findOne({ where: { idempotencyKey: dto.idempotencyKey } });
        if (existing) {
          return existing;
        }
      }

      // 2) Validate active material + derive or validate supplier
      const material = await this.assertActiveMaterial(manager, dto.materialId);
      const supplierId = await this.resolveSupplier(
        manager,
        dto.materialId,
        dto.supplierId,
      );

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
        idempotencyKey: dto.idempotencyKey ?? null,
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

      receiving.supplierId = supplierId;
      receiving.receiveQuantity = newReceiveQuantity;
      receiving.packingQuantity = packingQuantity;
      receiving.packageCount = packageCount;
      receiving.supplierProductionDate = supplierProductionDate;
      receiving.supplierLotNo = supplierLotNo;
      receiving.receiveDate = dto.receiveDate ?? receiving.receiveDate;
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
   * Return the base64 QR code for a specific package.
   */
  async getPackageQrCode(packageId: string): Promise<string | null> {
    const pkg = await this.packageRepository.findOne({ where: { id: packageId } });
    return pkg?.qrCode ?? null;
  }

  /**
   * Return active suppliers linked to a given material.
   * Used by the frontend to determine if supplierId is required in the create form.
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
      supplierId: m.supplier.id,
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
   * จัดสรร Internal Lot No. แบบ CCI-YYYYMMDD-XXX
   * - ใช้ material_receiving_lot_counters (lock แบบ SELECT FOR UPDATE)
   *   เพื่อกัน duplicate แม้มี request เข้าพร้อมกัน
   * - UNIQUE constraint บน internal_lot_no เป็น defense in depth
   * - Running number reset ทุกวัน เพราะใช้ lot_date เป็น partition key
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
    return `${LOT_PREFIX}-${lotDatePart(receiveDate)}${String(counter.lastNumber).padStart(5, '0')}`;
  }

  /**
   * Build Supplier Lot No. format: SUP-YYYY[M]DD
   * e.g. SUP-2026H13
   */
  private buildSupplierLotNo(productionDate: string): string {
    return `${SUPPLIER_LOT_PREFIX}-${lotDatePart(productionDate)}`;
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
      supplierLotNo: receiving.supplierLotNo,
      supplierProductionDate: receiving.supplierProductionDate,
      receiveDate: receiving.receiveDate,
      status: receiving.status,
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
          }
        : null,
      packages: receiving.packages
        ? receiving.packages.map((pkg) => ({
            id: pkg.id,
            packageNo: pkg.packageNo,
            lotDetailNo: pkg.lotDetailNo,
            quantity: pkg.quantity,
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
