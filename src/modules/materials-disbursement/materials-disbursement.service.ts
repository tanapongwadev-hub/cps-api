import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository, SelectQueryBuilder } from 'typeorm';
import { MaterialReceivingPackage } from '../../entities/inventory/material-receiving-package.entity';
import { MaterialReceiving } from '../../entities/inventory/material-receiving.entity';
import { MaterialsDisbursementCounter } from '../../entities/inventory/materials-disbursement-counter.entity';
import { StockBalance } from '../../entities/inventory/stock-balance.entity';
import { StockTransaction } from '../../entities/inventory/stock-transaction.entity';
import { Material } from '../../entities/master/material.entity';
import { Unit } from '../../entities/master/unit.entity';
import {
  ListMaterialsDisbursementQueryDto,
  DISBURSEMENT_SORT_COLUMNS,
  DisbursementSortBy,
} from './dto/list-materials-disbursement-query.dto';
import { ReportMaterialsDisbursementQueryDto } from './dto/report-materials-disbursement.dto';
import { MaterialsDisbursement } from './materials-disbursement.entity';
import { MaterialDisbursementItem } from './material-disbursement-item.entity';
import { MaterialDisbursementPackage } from './material-disbursement-package.entity';

const DECIMAL_SCALE = 4;

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
    @InjectRepository(StockTransaction)
    private readonly stockTransactionRepository: Repository<StockTransaction>,
    @InjectRepository(Material)
    private readonly materialRepository: Repository<Material>,
    @InjectRepository(Unit)
    private readonly unitRepository: Repository<Unit>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  // ---------------------------------------------------------------- commands

  async create(dto: any, userId: string): Promise<MaterialsDisbursement> {
    // Validate items
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('At least one disbursement item is required');
    }

    // Validate stock_cut requires reason
    if (dto.disbursementType === 'stock_cut' && !dto.reason?.trim()) {
      throw new BadRequestException('Reason is required for stock_cut disbursement');
    }

    // Validate disbursement date not in future
    const today = new Date().toISOString().slice(0, 10);
    if (dto.disbursementDate > today) {
      throw new BadRequestException('Disbursement date cannot be in the future');
    }

    // Validate positive quantities
    for (const item of dto.items) {
      if (this.toScaled(item.requestedQuantity) <= 0n) {
        throw new BadRequestException('Requested quantity must be greater than 0');
      }
    }

    const result = await this.dataSource.transaction(async (manager) => {
      // 1) Validate all materials exist and are active
      for (const item of dto.items) {
        await this.assertActiveMaterial(manager, item.materialId);
      }

      // 2) Generate disbursement number
      const disbursementNo = await this.allocateDisbursementNo(
        manager,
        dto.disbursementDate,
      );

      // 3) Save disbursement header
      const disbursementRepo = manager.getRepository(MaterialsDisbursement);
      const disbursement = disbursementRepo.create({
        disbursementNo,
        disbursementType: dto.disbursementType,
        disbursementDate: dto.disbursementDate,
        status: 'draft',
        reason: dto.reason?.trim() ?? null,
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

      return savedDisbursement.id;
    });

    return this.findOne(result);
  }

  async update(
    id: string,
    dto: any,
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

      // Validate stock_cut requires reason
      const disbursementType = dto.disbursementType ?? disbursement.disbursementType;
      const reason = dto.reason ?? disbursement.reason;
      if (disbursementType === 'stock_cut' && !reason?.trim()) {
        throw new BadRequestException('Reason is required for stock_cut disbursement');
      }

      // Validate quantities if updating items
      if (dto.items) {
        if (dto.items.length === 0) {
          throw new BadRequestException('At least one disbursement item is required');
        }
        for (const item of dto.items) {
          if (this.toScaled(item.requestedQuantity) <= 0n) {
            throw new BadRequestException('Requested quantity must be greater than 0');
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
        await manager.getRepository(MaterialDisbursementItem).delete({ disbursementId: id });

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
    });

    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
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

      await disbursementRepo.delete({ id });
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
        throw new ConflictException('Only a draft disbursement can be confirmed');
      }
      if (disbursement.disbursementDate > new Date().toISOString().slice(0, 10)) {
        throw new BadRequestException('Disbursement date cannot be in the future');
      }

      const itemRepo = manager.getRepository(MaterialDisbursementItem);
      const items = await itemRepo.find({ where: { disbursementId: id } });

      if (items.length === 0) {
        throw new BadRequestException('No items to disburse');
      }

      // Process each item with FIFO
      for (const item of items) {
        await this.processFifoForItem(manager, item, disbursement.disbursementNo, userId);
      }

      // Update disbursement status
      disbursement.status = 'confirmed';
      disbursement.confirmedBy = userId;
      disbursement.confirmedAt = new Date();
      await disbursementRepo.save(disbursement);
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

      // If confirmed, revert stock and restore packages
      if (disbursement.status === 'confirmed') {
        const itemRepo = manager.getRepository(MaterialDisbursementItem);
        const items = await itemRepo.find({ where: { disbursementId: id } });

        for (const item of items) {
          await this.revertFifoForItem(manager, item, disbursement.disbursementNo, userId);
        }
      }

      disbursement.status = 'cancelled';
      disbursement.cancelledBy = userId;
      disbursement.cancelledAt = new Date();
      disbursement.cancelReason = dto.cancelReason?.trim() ?? null;
      await disbursementRepo.save(disbursement);
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
              DISBURSEMENT_TYPE_LABELS[d.disbursementType] ?? d.disbursementType,
            reason: d.reason,
            materialCode: item.material?.code ?? '',
            materialName: item.material?.name ?? '',
            materialType: item.material?.materialType ?? null,
            requestedQuantity: item.requestedQuantity,
            disbursedQuantity: item.disbursedQuantity,
            unitSymbol: (item.material as any)?.unit?.symbol ?? '',
            status: d.status,
            statusLabel: STATUS_LABELS[d.status] ?? d.status,
            sourceLotNo:
              sourceLots.length > 0 ? sourceLots.join(', ') : null,
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
      this.unitRepository.find({ where: { isActive: true }, order: { code: 'ASC' } }),
    ]);

    // Get available stock per material (from StockBalance)
    const balances = await this.stockBalanceRepository.find();
    const stockByMaterial = new Map(balances.map((b) => [b.materialId, b.quantity]));

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
    disbursementNo: string,
    userId: string,
  ): Promise<void> {
    const requestedQty = this.toScaled(item.requestedQuantity);
    let remainingQty = requestedQty;

    // Query packages with FIFO (oldest first by receiveDate)
    const packages = await manager
      .getRepository(MaterialReceivingPackage)
      .createQueryBuilder('pkg')
      .leftJoin('pkg.materialReceiving', 'receiving')
      .where(`pkg.materialReceivingId IN (
        SELECT mr.id FROM inventory.material_receivings mr
        WHERE mr.material_id = :materialId
      )`, { materialId: item.materialId })
      .andWhere('pkg.status = :status', { status: 'in_stock' })
      .orderBy('receiving.receiveDate', 'ASC')
      .addOrderBy('pkg.id', 'ASC')
      .getMany();

    const totalAvailable = packages.reduce(
      (sum, p) => sum + this.toScaled(p.quantity),
      0n,
    );

    if (totalAvailable < requestedQty) {
      throw new BadRequestException(
        `Insufficient stock for material ${item.materialId}. ` +
        `Requested: ${item.requestedQuantity}, Available: ${this.fromScaled(totalAvailable)}`,
      );
    }

    const packageRecordRepo = manager.getRepository(MaterialDisbursementPackage);
    const packageRepo = manager.getRepository(MaterialReceivingPackage);
    const stockBalanceRepo = manager.getRepository(StockBalance);
    const stockTxRepo = manager.getRepository(StockTransaction);

    // Lock and update stock balance
    let balance = await stockBalanceRepo.findOne({
      where: { materialId: item.materialId },
      lock: { mode: 'pessimistic_write' },
    });
    const quantityBefore = balance ? balance.quantity : '0';

    let totalDisbursed = 0n;

    for (const pkg of packages) {
      if (remainingQty <= 0n) break;

      const pkgQty = this.toScaled(pkg.quantity);
      const qtyToDeduct = pkgQty < remainingQty ? pkgQty : remainingQty;

      // Update package
      const newPkgQty = this.fromScaled(pkgQty - qtyToDeduct);
      if (newPkgQty === '0.0000') {
        // Fully used
        pkg.quantity = '0.0000';
        pkg.status = 'issued';
      } else {
        // Partial use
        pkg.quantity = newPkgQty;
        // status stays 'in_stock'
      }
      await packageRepo.save(pkg);

      // Record which package was used
      await packageRecordRepo.save(
        packageRecordRepo.create({
          disbursementItemId: item.id,
          packageId: pkg.id,
          disbursedQuantity: this.fromScaled(qtyToDeduct),
          createdBy: userId,
        }),
      );

      // Get receiving for lot no
      const receiving = await manager.getRepository(MaterialReceiving).findOne({
        where: { id: pkg.materialReceivingId },
      });

      // Create stock transaction record
      await stockTxRepo.save(
        stockTxRepo.create({
          materialId: item.materialId,
          transactionType: 'ISSUE',
          referenceType: 'MATERIALS_DISBURSEMENT',
          referenceId: item.disbursementId,
          referenceLotNo: receiving?.internalLotNo ?? null,
          quantityBefore: this.fromScaled(this.toScaled(quantityBefore) - totalDisbursed),
          quantityIn: this.fromScaled(0n),
          quantityOut: this.fromScaled(qtyToDeduct),
          quantityAfter: this.fromScaled(this.toScaled(quantityBefore) - totalDisbursed - qtyToDeduct),
          transactionDate: new Date(),
          remark: `Disbursed from ${disbursementNo}`,
          createdBy: userId,
        }),
      );

      remainingQty -= qtyToDeduct;
      totalDisbursed += qtyToDeduct;
    }

    // Update stock balance (decrement)
    const newBalanceQty = this.fromScaled(this.toScaled(quantityBefore) - totalDisbursed);
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
    item.disbursedQuantity = this.fromScaled(totalDisbursed);
    await itemRepo.save(item);
  }

  private async revertFifoForItem(
    manager: EntityManager,
    item: MaterialDisbursementItem,
    disbursementNo: string,
    userId: string,
  ): Promise<void> {
    // Get all package records for this item
    const packageRecords = await manager
      .getRepository(MaterialDisbursementPackage)
      .find({ where: { disbursementItemId: item.id } });

    const packageRepo = manager.getRepository(MaterialReceivingPackage);
    const stockBalanceRepo = manager.getRepository(StockBalance);
    const stockTxRepo = manager.getRepository(StockTransaction);

    let totalRestored = 0n;

    for (const record of packageRecords) {
      const pkg = await packageRepo.findOne({ where: { id: record.packageId } });
      if (!pkg) continue;

      const restoredQty = this.toScaled(record.disbursedQuantity);
      const currentPkgQty = this.toScaled(pkg.quantity);

      // Restore package quantity
      pkg.quantity = this.fromScaled(currentPkgQty + restoredQty);
      pkg.status = 'in_stock';
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
      const quantityAfter = this.fromScaled(this.toScaled(quantityBefore) + restoredQty);

      // Create adjustment transaction
      await stockTxRepo.save(
        stockTxRepo.create({
          materialId: item.materialId,
          transactionType: 'ADJUST',
          referenceType: 'MATERIALS_DISBURSEMENT',
          referenceId: item.disbursementId,
          referenceLotNo: receiving?.internalLotNo ?? null,
          quantityBefore,
          quantityIn: this.fromScaled(restoredQty),
          quantityOut: this.fromScaled(0n),
          quantityAfter,
          transactionDate: new Date(),
          remark: `Cancelled ${disbursementNo}: restored ${this.fromScaled(restoredQty)}`,
          createdBy: userId,
        }),
      );

      // Update balance
      if (balance) {
        balance.quantity = quantityAfter;
        balance.lastMovementAt = new Date();
        await stockBalanceRepo.save(balance);
      }

      // Delete the package record
      await manager.getRepository(MaterialDisbursementPackage).delete({ id: record.id });
    }

    // Reset item disbursed quantity
    const itemRepo = manager.getRepository(MaterialDisbursementItem);
    item.disbursedQuantity = '0.0000';
    await itemRepo.save(item);
  }

  private createListQuery(
    query: ListMaterialsDisbursementQueryDto,
  ): SelectQueryBuilder<MaterialsDisbursement> {
    const queryBuilder = this.disbursementRepository
      .createQueryBuilder('disbursement')
      .leftJoinAndSelect('disbursement.items', 'items')
      .leftJoinAndSelect('items.material', 'material');

    if (query.search) {
      queryBuilder.andWhere(
        'disbursement.disbursement_no ILIKE :search',
        { search: `%${query.search}%` },
      );
    }
    if (query.status) {
      queryBuilder.andWhere('disbursement.status = :status', { status: query.status });
    }
    if (query.disbursementType) {
      queryBuilder.andWhere('disbursement.disbursement_type = :disbursementType', {
        disbursementType: query.disbursementType,
      });
    }
    if (query.disbursementDateFrom) {
      queryBuilder.andWhere('disbursement.disbursement_date >= :disbursementDateFrom', {
        disbursementDateFrom: query.disbursementDateFrom,
      });
    }
    if (query.disbursementDateTo) {
      queryBuilder.andWhere('disbursement.disbursement_date <= :disbursementDateTo', {
        disbursementDateTo: query.disbursementDateTo,
      });
    }
    return queryBuilder;
  }

  /**
   * Generate disbursement number: DIS-YYYYMMDD-XXXX
   */
  private async allocateDisbursementNo(
    manager: EntityManager,
    disbursementDate: string,
  ): Promise<string> {
    const counterRepo = manager.getRepository(MaterialsDisbursementCounter);
    const where = { disbursementDate };
    let counter = await counterRepo.findOne({
      where,
      lock: { mode: 'pessimistic_write' },
    });

    if (!counter) {
      await manager.query(
        `INSERT INTO inventory.materials_disbursement_counters
           (disbursement_date, last_number)
         VALUES ($1, 0)
         ON CONFLICT (disbursement_date) DO NOTHING`,
        [disbursementDate],
      );
      counter = await counterRepo.findOne({
        where,
        lock: { mode: 'pessimistic_write' },
      });
    }

    if (!counter) {
      throw new ConflictException('Failed to allocate disbursement number');
    }

    counter.lastNumber += 1;
    await counterRepo.save(counter);

    const datePart = disbursementDate.replace(/-/g, '');
    return `DIS-${datePart}-${String(counter.lastNumber).padStart(4, '0')}`;
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

  // Decimal helpers (matching materials-receiving pattern)
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

  private toListResponse(disbursement: MaterialsDisbursement) {
    return {
      id: disbursement.id,
      disbursementNo: disbursement.disbursementNo,
      disbursementType: disbursement.disbursementType,
      disbursementDate: disbursement.disbursementDate,
      status: disbursement.status,
      reason: disbursement.reason,
      attachmentUrl: disbursement.attachmentUrl,
      attachmentName: disbursement.attachmentName,
      remark: disbursement.remark,
      confirmedBy: disbursement.confirmedBy,
      confirmedAt: disbursement.confirmedAt,
      cancelledBy: disbursement.cancelledBy,
      cancelledAt: disbursement.cancelledAt,
      cancelReason: disbursement.cancelReason,
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
              ? { id: item.material.id, code: item.material.code, name: item.material.name }
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
      disbursementNo: disbursement.disbursementNo,
      disbursementType: disbursement.disbursementType,
      disbursementDate: disbursement.disbursementDate,
      status: disbursement.status,
      reason: disbursement.reason,
      attachmentUrl: disbursement.attachmentUrl,
      attachmentName: disbursement.attachmentName,
      remark: disbursement.remark,
      confirmedBy: disbursement.confirmedBy,
      confirmedAt: disbursement.confirmedAt,
      cancelledBy: disbursement.cancelledBy,
      cancelledAt: disbursement.cancelledAt,
      cancelReason: disbursement.cancelReason,
      createdBy: disbursement.createdBy,
      createdAt: disbursement.createdAt,
      updatedAt: disbursement.updatedAt,
      items: disbursement.items.map((item) => ({
        id: item.id,
        materialId: item.materialId,
        requestedQuantity: item.requestedQuantity,
        disbursedQuantity: item.disbursedQuantity,
        material: item.material
          ? { id: item.material.id, code: item.material.code, name: item.material.name }
          : null,
        packages: (packagesByItem.get(item.id) ?? []).map((pkg) => ({
          id: pkg.id,
          packageId: pkg.packageId,
          disbursedQuantity: pkg.disbursedQuantity,
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
