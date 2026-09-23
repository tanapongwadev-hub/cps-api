import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Workbook } from 'exceljs';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { recordAuditEvent } from '../../common/stock-ledger';
import { fromScaled, toScaled } from '../../common/decimal';
import { MaterialReceivingPackage } from '../../entities/inventory/material-receiving-package.entity';
import { Material } from '../../entities/master/material.entity';
import {
  BomStatus,
  ProductBom,
  ProductBomItem,
} from '../../entities/master/product-bom.entity';
import { Product } from '../../entities/master/product.entity';
import { MaterialJobOrdersService } from '../material-job-orders/material-job-orders.service';
import { CancelProductionPlanDto } from './dto/cancel-production-plan.dto';
import {
  CreateProductionPlanDto,
  CreateProductionPlanLineDto,
} from './dto/create-production-plan.dto';
import { ImportProductionPlanDto } from './dto/import-production-plan.dto';
import { ListProductionPlansQueryDto } from './dto/list-production-plans-query.dto';
import { UpdateProductionPlanDto } from './dto/update-production-plan.dto';
import { ProductionPlanLine } from './production-plan-line.entity';
import {
  ProductionPlanReservation,
  ProductionPlanReservationReleaseType,
} from './production-plan-reservation.entity';
import { ProductionPlan } from './production-plan.entity';

const AUTO_EXPIRY_REASON = 'หมดอายุอัตโนมัติ (เกิน 3 วันหลังอนุมัติ)';

export interface ProductionPlanImportFile {
  buffer: Buffer;
  originalname?: string;
}

interface MaterialDemand {
  lineId: string;
  materialId: string;
  required: bigint;
}

interface PackageAvailability {
  pkg: MaterialReceivingPackage;
  materialId: string;
  available: bigint;
}

@Injectable()
export class ProductionPlansService {
  constructor(
    @InjectRepository(ProductionPlan)
    private readonly planRepository: Repository<ProductionPlan>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly jobOrders: MaterialJobOrdersService,
  ) {}

  async create(
    dto: CreateProductionPlanDto,
    userId: string,
  ): Promise<ProductionPlan> {
    const id = await this.dataSource.transaction(async (manager) => {
      const code = await this.allocatePlanCode(manager);
      const planRepo = manager.getRepository(ProductionPlan);
      const plan = await planRepo.save(
        planRepo.create({
          code,
          title: dto.title?.trim() || null,
          remark: dto.remark?.trim() || null,
          status: 'DRAFT',
          createdBy: userId,
          approvedBy: null,
          approvedAt: null,
          issuedBy: null,
          issuedAt: null,
          cancelledBy: null,
          cancelledAt: null,
          cancelReason: null,
        }),
      );

      await this.replaceLines(manager, plan.id, dto.lines, userId);
      await recordAuditEvent(manager, {
        traceId: plan.code,
        action: 'CREATE',
        targetType: 'PRODUCTION_PLAN',
        targetId: plan.id,
        performedBy: userId,
        after: { code: plan.code, status: plan.status, lines: dto.lines },
      });
      return plan.id;
    });

    return this.findOne(id);
  }

  async importExcel(
    file: ProductionPlanImportFile | undefined,
    dto: ImportProductionPlanDto,
    userId: string,
  ): Promise<ProductionPlan> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Excel file is required');
    }

    const workbook = new Workbook();
    try {
      await workbook.xlsx.load(Uint8Array.from(file.buffer).buffer);
    } catch {
      throw new BadRequestException('Unable to read the uploaded Excel file');
    }

    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      throw new BadRequestException('The Excel file has no worksheet');
    }

    const expectedHeaders = [
      'product code',
      'quantity',
      'need-by date',
      'remark',
    ];
    const headerByName = new Map<string, number>();
    worksheet.getRow(1).eachCell((cell, column) => {
      headerByName.set(this.cellText(cell.value).trim().toLowerCase(), column);
    });
    const missing = expectedHeaders.filter(
      (header) => !headerByName.has(header),
    );
    if (missing.length > 0) {
      throw new BadRequestException(
        `Missing Excel column(s): ${missing.join(', ')}`,
      );
    }

    const imported: Array<{
      productCode: string;
      quantity: number;
      needByDate: string;
      remark?: string;
      row: number;
    }> = [];
    for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
      const row = worksheet.getRow(rowNumber);
      const productCode = this.cellText(
        row.getCell(headerByName.get('product code')!).value,
      ).trim();
      const quantityValue = row.getCell(headerByName.get('quantity')!).value;
      const needByValue = row.getCell(headerByName.get('need-by date')!).value;
      const remark = this.cellText(
        row.getCell(headerByName.get('remark')!).value,
      ).trim();

      if (
        !productCode &&
        quantityValue == null &&
        needByValue == null &&
        !remark
      ) {
        continue;
      }
      const quantity = Number(quantityValue);
      if (!productCode || !Number.isInteger(quantity) || quantity <= 0) {
        throw new BadRequestException(
          `Excel row ${rowNumber}: Product Code and a positive integer Quantity are required`,
        );
      }
      imported.push({
        productCode,
        quantity,
        needByDate: this.excelDate(needByValue, rowNumber),
        remark: remark || undefined,
        row: rowNumber,
      });
    }
    if (imported.length === 0) {
      throw new BadRequestException('The Excel file contains no Plan Lines');
    }

    const codes = [...new Set(imported.map((line) => line.productCode))];
    const products = await this.productRepository.find({
      where: { code: In(codes), isActive: true },
    });
    const productByCode = new Map(
      products.map((product) => [product.code, product]),
    );
    const lines = imported.map((line) => {
      const product = productByCode.get(line.productCode);
      if (!product) {
        throw new BadRequestException(
          `Excel row ${line.row}: active Product Code "${line.productCode}" was not found`,
        );
      }
      return {
        productId: product.id,
        quantity: line.quantity,
        needByDate: line.needByDate,
        remark: line.remark,
      };
    });

    return this.create({ title: dto.title, remark: dto.remark, lines }, userId);
  }

  async update(
    id: string,
    dto: UpdateProductionPlanDto,
    userId: string,
  ): Promise<ProductionPlan> {
    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(ProductionPlan);
      const plan = await repo.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!plan) throw new NotFoundException('Production Plan not found');
      if (plan.status !== 'DRAFT') {
        throw new ConflictException(
          'Only a DRAFT Production Plan can be edited',
        );
      }

      const before = { title: plan.title, remark: plan.remark };
      if (dto.title !== undefined) plan.title = dto.title.trim() || null;
      if (dto.remark !== undefined) plan.remark = dto.remark.trim() || null;
      await repo.save(plan);
      if (dto.lines) {
        await this.replaceLines(manager, plan.id, dto.lines, userId);
      }
      await recordAuditEvent(manager, {
        traceId: plan.code,
        action: 'UPDATE',
        targetType: 'PRODUCTION_PLAN',
        targetId: plan.id,
        performedBy: userId,
        before,
        after: { title: plan.title, remark: plan.remark, lines: dto.lines },
      });
    });
    return this.findOne(id);
  }

  async approve(id: string, userId: string): Promise<ProductionPlan> {
    await this.dataSource.transaction(async (manager) => {
      const plan = await this.lockPlan(manager, id);
      if (plan.status !== 'DRAFT') {
        throw new ConflictException(
          'Only a DRAFT Production Plan can be approved',
        );
      }
      const lines = await manager.getRepository(ProductionPlanLine).find({
        where: { productionPlanId: id },
        order: { id: 'ASC' },
      });
      if (lines.length === 0) {
        throw new BadRequestException(
          'Production Plan requires at least one Plan Line',
        );
      }

      const demands = await this.buildMaterialDemands(manager, lines);
      const materialIds = [
        ...new Set(demands.map((demand) => demand.materialId)),
      ];
      const packageAvailability = await this.lockPackageAvailability(
        manager,
        materialIds,
      );
      await this.assertSufficientStock(manager, demands, packageAvailability);

      const availabilityByPackage = new Map(
        packageAvailability.map((entry) => [entry.pkg.id, entry.available]),
      );
      const packagesByMaterial = new Map<string, PackageAvailability[]>();
      for (const entry of packageAvailability) {
        const entries = packagesByMaterial.get(entry.materialId) ?? [];
        entries.push(entry);
        packagesByMaterial.set(entry.materialId, entries);
      }

      const reservationRepo = manager.getRepository(ProductionPlanReservation);
      for (const demand of demands) {
        let needed = demand.required;
        for (const entry of packagesByMaterial.get(demand.materialId) ?? []) {
          if (needed <= 0n) break;
          const available = availabilityByPackage.get(entry.pkg.id) ?? 0n;
          if (available <= 0n) continue;
          const reserved = available < needed ? available : needed;
          await reservationRepo.save(
            reservationRepo.create({
              productionPlanLineId: demand.lineId,
              materialReceivingPackageId: entry.pkg.id,
              reservedQuantity: fromScaled(reserved),
              releasedAt: null,
              releaseType: null,
              releasedBy: null,
            }),
          );
          availabilityByPackage.set(entry.pkg.id, available - reserved);
          needed -= reserved;
        }
      }

      plan.status = 'APPROVED';
      plan.approvedBy = userId;
      plan.approvedAt = new Date();
      await manager.getRepository(ProductionPlan).save(plan);
      await recordAuditEvent(manager, {
        traceId: plan.code,
        action: 'APPROVE',
        targetType: 'PRODUCTION_PLAN',
        targetId: plan.id,
        performedBy: userId,
        before: { status: 'DRAFT' },
        after: { status: 'APPROVED' },
      });
      await recordAuditEvent(manager, {
        traceId: plan.code,
        action: 'RESERVE',
        targetType: 'PRODUCTION_PLAN',
        targetId: plan.id,
        performedBy: userId,
        after: { materialCount: materialIds.length },
      });

      // A Plan is never left APPROVED without its warehouse pick document —
      // create the Job Order in this SAME transaction, so a failure here
      // rolls back the reservations too (see docs/plans/2026-09-23-...).
      await this.jobOrders.createForPlan(manager, plan, userId);
    });
    return this.findOne(id);
  }

  /**
   * Superseded — the stock cut ("จ่ายออก") now happens on the linked
   * Material Job Order (created automatically when the Plan is approved),
   * not here. See MaterialJobOrdersService#issue and
   * docs/plans/2026-09-23-production-job-order-material-issue-plan.md § 17
   * open question Q6. This endpoint is kept only to fail with a clear
   * pointer for any stale client still calling it.
   */
  async issue(id: string, userId: string): Promise<ProductionPlan> {
    const plan = await this.planRepository.findOne({ where: { id } });
    if (!plan) throw new NotFoundException('Production Plan not found');
    await this.dataSource.transaction(async (manager) => {
      await recordAuditEvent(manager, {
        traceId: plan.code,
        action: 'STATUS_CHANGE',
        targetType: 'PRODUCTION_PLAN',
        targetId: plan.id,
        performedBy: userId,
        reason: 'Attempted call to the deprecated /issue endpoint',
      });
    });
    throw new ConflictException(
      'การจ่ายออกย้ายไปที่ใบจัดงานแล้ว กรุณาไปที่ จัดการวัสดุ > ใบจัดงาน เพื่อจ่ายออก',
    );
  }

  async cancel(
    id: string,
    dto: CancelProductionPlanDto,
    userId: string,
  ): Promise<ProductionPlan> {
    const reason = dto.reason.trim();
    if (!reason)
      throw new BadRequestException('Cancellation reason is required');
    await this.dataSource.transaction(async (manager) => {
      const plan = await this.lockPlan(manager, id);
      if (!['DRAFT', 'APPROVED'].includes(plan.status)) {
        throw new ConflictException(
          'Only a DRAFT or APPROVED Production Plan can be cancelled',
        );
      }
      const previousStatus = plan.status;
      if (plan.status === 'APPROVED') {
        // Blocks (409) if the linked Job Order already issued something —
        // must run before releaseReservations, not after.
        await this.jobOrders.assertCancellable(manager, plan.id);
        await this.releaseReservations(manager, plan.id, 'CANCELLED', userId);
        await recordAuditEvent(manager, {
          traceId: plan.code,
          action: 'RELEASE',
          targetType: 'PRODUCTION_PLAN',
          targetId: plan.id,
          performedBy: userId,
          reason,
        });
        await this.jobOrders.cancelForPlan(manager, plan.id, reason, userId);
      }
      plan.status = 'CANCELLED';
      plan.cancelledBy = userId;
      plan.cancelledAt = new Date();
      plan.cancelReason = reason;
      await manager.getRepository(ProductionPlan).save(plan);
      await recordAuditEvent(manager, {
        traceId: plan.code,
        action: 'CANCEL',
        targetType: 'PRODUCTION_PLAN',
        targetId: plan.id,
        performedBy: userId,
        before: { status: previousStatus },
        after: { status: 'CANCELLED' },
        reason,
      });
    });
    return this.findOne(id);
  }

  async remove(id: string, userId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const plan = await this.lockPlan(manager, id);
      if (plan.status !== 'DRAFT') {
        throw new ConflictException(
          'Only a DRAFT Production Plan can be deleted',
        );
      }
      await manager.getRepository(ProductionPlan).remove(plan);
      await recordAuditEvent(manager, {
        traceId: plan.code,
        action: 'DELETE',
        targetType: 'PRODUCTION_PLAN',
        targetId: plan.id,
        performedBy: userId,
        before: { code: plan.code, status: plan.status },
      });
    });
  }

  async expireApprovedPlans(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    const candidates = await this.planRepository.find({
      where: { status: 'APPROVED' },
      select: { id: true },
    });
    let expired = 0;
    for (const candidate of candidates) {
      const changed = await this.dataSource.transaction(async (manager) => {
        const plan = await this.lockPlan(manager, candidate.id);
        if (
          plan.status !== 'APPROVED' ||
          !plan.approvedAt ||
          plan.approvedAt >= cutoff
        ) {
          return false;
        }
        if (!(await this.jobOrders.isExpirable(manager, plan.id))) {
          // Picking has already started (or the Job Order has moved past
          // WAITING_PICKING) — stop the 3-day clock, per plan § 17 Q2.
          return false;
        }
        await this.releaseReservations(manager, plan.id, 'EXPIRED', null);
        plan.status = 'EXPIRED';
        plan.cancelledBy = null;
        plan.cancelledAt = now;
        plan.cancelReason = AUTO_EXPIRY_REASON;
        await manager.getRepository(ProductionPlan).save(plan);
        await recordAuditEvent(manager, {
          traceId: plan.code,
          action: 'RELEASE',
          targetType: 'PRODUCTION_PLAN',
          targetId: plan.id,
          performedBy: null,
          reason: AUTO_EXPIRY_REASON,
        });
        await this.jobOrders.cancelForPlan(
          manager,
          plan.id,
          AUTO_EXPIRY_REASON,
          null,
        );
        return true;
      });
      if (changed) expired += 1;
    }
    return expired;
  }

  async findAll(query: ListProductionPlansQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const qb = this.planRepository
      .createQueryBuilder('plan')
      .leftJoinAndSelect('plan.lines', 'line')
      .leftJoinAndSelect('line.product', 'product');
    if (query.search) {
      qb.andWhere(
        '(plan.code ILIKE :search OR plan.title ILIKE :search OR product.code ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }
    if (query.status)
      qb.andWhere('plan.status = :status', { status: query.status });
    if (query.needByDateFrom) {
      qb.andWhere('line.needByDate >= :needByDateFrom', {
        needByDateFrom: query.needByDateFrom,
      });
    }
    if (query.needByDateTo) {
      qb.andWhere('line.needByDate <= :needByDateTo', {
        needByDateTo: query.needByDateTo,
      });
    }
    const [items, totalItems] = await qb
      .orderBy('plan.createdAt', 'DESC')
      .addOrderBy('plan.id', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    const jobOrderByPlanId = await this.jobOrders.findSummaryByPlanIds(
      items.map((plan) => plan.id),
    );

    return {
      items: items.map((plan) => ({
        ...plan,
        jobOrder: jobOrderByPlanId.get(plan.id) ?? null,
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
    const plan = await this.planRepository.findOne({
      where: { id },
      relations: [
        'lines',
        'lines.product',
        'lines.bom',
        'lines.bom.items',
        'lines.bom.items.material',
        'lines.reservations',
        'lines.reservations.materialReceivingPackage',
        'lines.reservations.materialReceivingPackage.materialReceiving',
      ],
      order: { lines: { id: 'ASC', reservations: { id: 'ASC' } } },
    });
    if (!plan) throw new NotFoundException('Production Plan not found');
    const jobOrder = await this.jobOrders.findSummaryByPlanId(plan.id);
    return { ...plan, jobOrder };
  }

  async getLookups() {
    const products = await this.productRepository
      .createQueryBuilder('product')
      .innerJoinAndSelect('product.boms', 'bom', 'bom.status = :status', {
        status: BomStatus.ACTIVE,
      })
      .where('product.isActive = true')
      .orderBy('product.code', 'ASC')
      .getMany();
    return {
      products: products.map((product) => ({
        id: product.id,
        code: product.code,
        name: product.name,
        lotSize: product.lotSize,
        activeBomId: product.boms[0]?.id,
        activeBomVersion: product.boms[0]?.version,
      })),
    };
  }

  private async replaceLines(
    manager: EntityManager,
    planId: string,
    inputs: CreateProductionPlanLineDto[],
    userId: string,
  ): Promise<void> {
    const lineRepo = manager.getRepository(ProductionPlanLine);
    await lineRepo.delete({ productionPlanId: planId });
    for (const input of inputs) {
      const product = await manager.getRepository(Product).findOne({
        where: { id: input.productId, isActive: true },
      });
      if (!product) {
        throw new BadRequestException(
          `Active Product ${input.productId} was not found`,
        );
      }
      const bom = await manager.getRepository(ProductBom).findOne({
        where: { productId: product.id, status: BomStatus.ACTIVE },
        order: { updatedAt: 'DESC' },
      });
      if (!bom) {
        throw new BadRequestException(
          `Product ${product.code} has no ACTIVE BOM`,
        );
      }
      await lineRepo.save(
        lineRepo.create({
          productionPlanId: planId,
          productId: product.id,
          bomId: bom.id,
          quantity: input.quantity,
          needByDate: input.needByDate,
          remark: input.remark?.trim() || null,
          createdBy: userId,
          updatedBy: userId,
        }),
      );
    }
  }

  private async buildMaterialDemands(
    manager: EntityManager,
    lines: ProductionPlanLine[],
  ): Promise<MaterialDemand[]> {
    const demands: MaterialDemand[] = [];
    for (const line of lines) {
      const items = await manager.getRepository(ProductBomItem).find({
        where: { bomId: line.bomId, isScrap: false },
        order: { sortOrder: 'ASC', id: 'ASC' },
      });
      if (items.length === 0) {
        throw new BadRequestException(
          `ACTIVE BOM ${line.bomId} has no reservable material inputs`,
        );
      }
      const byMaterial = new Map<string, bigint>();
      for (const item of items) {
        if (item.isScrap) continue;
        // Deliberately excludes both isScrap=true rows (query above) and
        // wastagePercent. Required Quantity is exact by domain decision.
        const required =
          toScaled(String(item.quantity)) * BigInt(line.quantity);
        byMaterial.set(
          item.materialId,
          (byMaterial.get(item.materialId) ?? 0n) + required,
        );
      }
      for (const [materialId, required] of byMaterial) {
        demands.push({ lineId: line.id, materialId, required });
      }
    }
    return demands;
  }

  private async lockPackageAvailability(
    manager: EntityManager,
    materialIds: string[],
  ): Promise<PackageAvailability[]> {
    const packages = await manager
      .getRepository(MaterialReceivingPackage)
      .createQueryBuilder('pkg')
      .innerJoinAndSelect('pkg.materialReceiving', 'receiving')
      .where('receiving.materialId IN (:...materialIds)', { materialIds })
      .andWhere('pkg.status IN (:...statuses)', {
        statuses: ['in_stock', 'partial'],
      })
      .orderBy('receiving.materialId', 'ASC')
      .addOrderBy('receiving.receiveDate', 'ASC')
      .addOrderBy('pkg.id', 'ASC')
      .setLock('pessimistic_write', undefined, ['pkg'])
      .getMany();
    const packageIds = packages.map((pkg) => pkg.id);
    const reservedRows = packageIds.length
      ? ((await manager.query(
          `SELECT material_receiving_package_id AS package_id,
                  SUM(reserved_quantity - issued_quantity)::text AS reserved_quantity
           FROM inventory.production_plan_reservations
           WHERE released_at IS NULL
             AND material_receiving_package_id = ANY($1::bigint[])
           GROUP BY material_receiving_package_id`,
          [packageIds],
        )) as unknown as Array<{
          package_id: string;
          reserved_quantity: string;
        }>)
      : [];
    const reservedByPackage = new Map(
      reservedRows.map((row) => [
        String(row.package_id),
        toScaled(row.reserved_quantity),
      ]),
    );
    return packages.map((pkg) => {
      const remaining = toScaled(pkg.remainingQuantity);
      const reserved = reservedByPackage.get(pkg.id) ?? 0n;
      return {
        pkg,
        materialId: pkg.materialReceiving.materialId,
        available: remaining > reserved ? remaining - reserved : 0n,
      };
    });
  }

  private async assertSufficientStock(
    manager: EntityManager,
    demands: MaterialDemand[],
    packages: PackageAvailability[],
  ): Promise<void> {
    const requiredByMaterial = new Map<string, bigint>();
    for (const demand of demands) {
      requiredByMaterial.set(
        demand.materialId,
        (requiredByMaterial.get(demand.materialId) ?? 0n) + demand.required,
      );
    }
    const availableByMaterial = new Map<string, bigint>();
    for (const entry of packages) {
      availableByMaterial.set(
        entry.materialId,
        (availableByMaterial.get(entry.materialId) ?? 0n) + entry.available,
      );
    }
    const materialIds = [...requiredByMaterial.keys()];
    const materials = await manager.getRepository(Material).find({
      where: { id: In(materialIds) },
    });
    const materialById = new Map(
      materials.map((material) => [material.id, material]),
    );
    const shortfalls = materialIds.flatMap((materialId) => {
      const required = requiredByMaterial.get(materialId) ?? 0n;
      const available = availableByMaterial.get(materialId) ?? 0n;
      if (available >= required) return [];
      const material = materialById.get(materialId);
      return [
        {
          materialId,
          materialCode: material?.code ?? materialId,
          materialName: material?.name ?? '',
          required: fromScaled(required),
          available: fromScaled(available),
          shortage: fromScaled(required - available),
        },
      ];
    });
    if (shortfalls.length > 0) {
      throw new ConflictException({
        message: 'Insufficient stock to approve the Production Plan',
        shortfalls,
      });
    }
  }

  private async releaseReservations(
    manager: EntityManager,
    planId: string,
    releaseType: ProductionPlanReservationReleaseType,
    userId: string | null,
  ): Promise<void> {
    const reservations = await manager
      .getRepository(ProductionPlanReservation)
      .createQueryBuilder('reservation')
      .innerJoin('reservation.productionPlanLine', 'line')
      .where('line.productionPlanId = :planId', { planId })
      .andWhere('reservation.releasedAt IS NULL')
      .getMany();
    const now = new Date();
    for (const reservation of reservations) {
      reservation.releasedAt = now;
      reservation.releaseType = releaseType;
      reservation.releasedBy = userId;
    }
    if (reservations.length > 0) {
      await manager.getRepository(ProductionPlanReservation).save(reservations);
    }
  }

  private async lockPlan(
    manager: EntityManager,
    id: string,
  ): Promise<ProductionPlan> {
    const plan = await manager.getRepository(ProductionPlan).findOne({
      where: { id },
      lock: { mode: 'pessimistic_write' },
    });
    if (!plan) throw new NotFoundException('Production Plan not found');
    return plan;
  }

  private async allocatePlanCode(manager: EntityManager): Promise<string> {
    const parts = new Intl.DateTimeFormat('en', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
      month: '2-digit',
    }).formatToParts(new Date());
    const year = parts.find((part) => part.type === 'year')!.value;
    const month = parts.find((part) => part.type === 'month')!.value;
    const prefix = `PP-${year}${month}-`;
    await manager.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [prefix]);
    const rows = (await manager.query(
      `SELECT COALESCE(MAX(RIGHT(code, 4)::integer), 0) AS last_number
       FROM inventory.production_plans
       WHERE code LIKE $1`,
      [`${prefix}%`],
    )) as unknown as Array<{ last_number: number | string }>;
    const next = Number(rows[0]?.last_number ?? 0) + 1;
    return `${prefix}${String(next).padStart(4, '0')}`;
  }

  private cellText(value: unknown): string {
    if (value == null) return '';
    if (typeof value === 'object') {
      if ('text' in value && typeof value.text === 'string') return value.text;
      if ('result' in value) return this.cellText(value.result);
      if ('richText' in value && Array.isArray(value.richText)) {
        return value.richText
          .map((part: { text?: string }) => part.text ?? '')
          .join('');
      }
    }
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      return String(value);
    }
    return '';
  }

  private excelDate(value: unknown, rowNumber: number): string {
    let date: Date;
    if (value instanceof Date) {
      date = value;
    } else if (typeof value === 'number') {
      date = new Date(Date.UTC(1899, 11, 30) + value * 24 * 60 * 60 * 1000);
    } else {
      const text = this.cellText(value).trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
        throw new BadRequestException(
          `Excel row ${rowNumber}: Need-by Date must be YYYY-MM-DD or an Excel date`,
        );
      }
      date = new Date(`${text}T00:00:00.000Z`);
    }
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(
        `Excel row ${rowNumber}: Need-by Date is invalid`,
      );
    }
    return date.toISOString().slice(0, 10);
  }
}
