import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { fromScaled, toScaled } from '../../common/decimal';
import { allocateDisbursementNo } from '../../common/disbursement-number';
import {
  createTraceId,
  recordAuditEvent,
  recordStockMovement,
} from '../../common/stock-ledger';
import { MaterialReceivingPackage } from '../../entities/inventory/material-receiving-package.entity';
import { StockBalance } from '../../entities/inventory/stock-balance.entity';
import { Material } from '../../entities/master/material.entity';
import { MaterialDisbursementItem } from '../materials-disbursement/material-disbursement-item.entity';
import { MaterialDisbursementPackage } from '../materials-disbursement/material-disbursement-package.entity';
import { MaterialsDisbursement } from '../materials-disbursement/materials-disbursement.entity';
import { ProductionPlan } from '../production-plans/production-plan.entity';
import { ProductionPlanReservation } from '../production-plans/production-plan-reservation.entity';
import { IssueMaterialJobOrderDto } from './dto/issue-material-job-order.dto';
import {
  ListMaterialJobOrdersQueryDto,
  parseStatusFilter,
} from './dto/list-material-job-orders-query.dto';
import { PickMaterialJobOrderDto } from './dto/pick-material-job-order.dto';
import { MaterialJobOrder } from './material-job-order.entity';

@Injectable()
export class MaterialJobOrdersService {
  constructor(
    @InjectRepository(MaterialJobOrder)
    private readonly jobOrderRepository: Repository<MaterialJobOrder>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  // ------------------------------------------------------------- lifecycle

  /**
   * Called from ProductionPlansService#approve, inside the SAME transaction
   * that just inserted the FIFO reservations — a Plan is never left
   * APPROVED without a Job Order. Does not open its own transaction.
   */
  async createForPlan(
    manager: EntityManager,
    plan: ProductionPlan,
    userId: string,
  ): Promise<MaterialJobOrder> {
    const code = await this.allocateCode(manager, new Date());
    const repo = manager.getRepository(MaterialJobOrder);
    const jobOrder = await repo.save(
      repo.create({
        code,
        productionPlanId: plan.id,
        status: 'WAITING_PICKING',
        version: 1,
        printCount: 0,
        createdBy: userId,
      }),
    );
    await recordAuditEvent(manager, {
      traceId: jobOrder.code,
      action: 'CREATE',
      targetType: 'MATERIAL_JOB_ORDER',
      targetId: jobOrder.id,
      performedBy: userId,
      after: { code: jobOrder.code, productionPlanId: plan.id },
    });
    return jobOrder;
  }

  /**
   * The 3-day auto-expiry cron may only reclaim a Plan's reservation while
   * its Job Order is still WAITING_PICKING and no line has been picked yet
   * — once a warehouse worker has started preparing the pick, the clock
   * stops (plan § 17 Q2).
   */
  async isExpirable(manager: EntityManager, planId: string): Promise<boolean> {
    const jobOrder = await manager.getRepository(MaterialJobOrder).findOne({
      where: { productionPlanId: planId },
    });
    if (!jobOrder || jobOrder.status !== 'WAITING_PICKING') return false;
    const pickedCount = await manager
      .getRepository(ProductionPlanReservation)
      .createQueryBuilder('reservation')
      .innerJoin('reservation.productionPlanLine', 'line')
      .where('line.productionPlanId = :planId', { planId })
      .andWhere('reservation.pickedAt IS NOT NULL')
      .getCount();
    return pickedCount === 0;
  }

  /**
   * Must be called (and its exception allowed to propagate) BEFORE the
   * caller releases any reservations — a Job Order that already issued
   * something can never be silently cancelled out from under a partially
   * cut disbursement history.
   */
  async assertCancellable(
    manager: EntityManager,
    planId: string,
  ): Promise<void> {
    const jobOrder = await manager.getRepository(MaterialJobOrder).findOne({
      where: { productionPlanId: planId },
    });
    if (jobOrder?.status === 'PARTIALLY_ISSUED') {
      throw new ConflictException(
        'ใบจัดงานนี้จ่ายออกไปแล้วบางส่วน ไม่สามารถยกเลิกแผนการผลิตได้ — กรุณาจ่ายออกให้ครบหรือติดต่อผู้ดูแลระบบ',
      );
    }
  }

  /**
   * Called from ProductionPlansService#cancel / #expireApprovedPlans, after
   * the Plan's reservations have already been released. Blocks (409) once
   * the Job Order has issued anything — see the plan's Q3 decision.
   */
  async cancelForPlan(
    manager: EntityManager,
    planId: string,
    reason: string,
    userId: string | null,
  ): Promise<void> {
    const jobOrder = await manager.getRepository(MaterialJobOrder).findOne({
      where: { productionPlanId: planId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!jobOrder) return;
    if (jobOrder.status === 'ISSUED' || jobOrder.status === 'CANCELLED') {
      return;
    }
    if (jobOrder.status === 'PARTIALLY_ISSUED') {
      // Re-checked here in case it changed between assertCancellable() and
      // this lock being acquired (both run inside the same transaction, so
      // this is a defense-in-depth guard, not the primary check).
      throw new ConflictException(
        'ใบจัดงานนี้จ่ายออกไปแล้วบางส่วน ไม่สามารถยกเลิกแผนการผลิตได้ — กรุณาจ่ายออกให้ครบหรือติดต่อผู้ดูแลระบบ',
      );
    }
    jobOrder.status = 'CANCELLED';
    jobOrder.cancelledBy = userId;
    jobOrder.cancelledAt = new Date();
    jobOrder.cancelReason = reason;
    jobOrder.version += 1;
    await manager.getRepository(MaterialJobOrder).save(jobOrder);
    await recordAuditEvent(manager, {
      traceId: jobOrder.code,
      action: 'CANCEL',
      targetType: 'MATERIAL_JOB_ORDER',
      targetId: jobOrder.id,
      performedBy: userId,
      before: { status: 'WAITING_PICKING' },
      after: { status: 'CANCELLED' },
      reason,
    });
  }

  // ------------------------------------------------------------------ print

  async print(id: string, userId: string) {
    await this.dataSource.transaction(async (manager) => {
      const jobOrder = await this.lockJobOrder(manager, id);
      if (jobOrder.status === 'CANCELLED') {
        throw new ConflictException(
          'ใบจัดงานนี้ถูกยกเลิกแล้ว ไม่สามารถพิมพ์ได้',
        );
      }
      jobOrder.printCount += 1;
      jobOrder.lastPrintedBy = userId;
      jobOrder.lastPrintedAt = new Date();
      await manager.getRepository(MaterialJobOrder).save(jobOrder);
      await recordAuditEvent(manager, {
        traceId: jobOrder.code,
        action: 'PRINT',
        targetType: 'MATERIAL_JOB_ORDER',
        targetId: jobOrder.id,
        performedBy: userId,
        after: { printCount: jobOrder.printCount },
      });
    });
    return this.findOne(id);
  }

  // -------------------------------------------------------------------- pick

  async pick(id: string, dto: PickMaterialJobOrderDto, userId: string) {
    await this.dataSource.transaction(async (manager) => {
      const jobOrder = await this.lockJobOrder(manager, id);
      if (jobOrder.version !== dto.version) {
        throw new ConflictException(
          'ใบจัดงานนี้ถูกแก้ไขโดยผู้อื่นแล้ว กรุณาโหลดข้อมูลใหม่',
        );
      }
      if (!['WAITING_PICKING', 'READY_TO_ISSUE'].includes(jobOrder.status)) {
        throw new ConflictException(
          'ใบจัดงานนี้ไม่อยู่ในสถานะที่หยิบสินค้าได้',
        );
      }

      const reservationRepo = manager.getRepository(ProductionPlanReservation);
      const reservation = await reservationRepo
        .createQueryBuilder('reservation')
        .innerJoin('reservation.productionPlanLine', 'line')
        .innerJoinAndSelect('reservation.materialReceivingPackage', 'pkg')
        .where('reservation.id = :id', { id: dto.reservationId })
        .andWhere('line.productionPlanId = :planId', {
          planId: jobOrder.productionPlanId,
        })
        .andWhere('reservation.releasedAt IS NULL')
        .setLock('pessimistic_write', undefined, ['reservation'])
        .getOne();
      if (!reservation) {
        throw new NotFoundException(
          'ไม่พบรายการนี้ในใบจัดงาน หรือรายการถูกปล่อยไปแล้ว',
        );
      }
      if (
        reservation.materialReceivingPackage.lotDetailNo !== dto.scannedCode
      ) {
        throw new BadRequestException(
          `QR ที่สแกน (${dto.scannedCode}) ไม่ตรงกับรายการที่ต้องหยิบในใบจัดงานนี้`,
        );
      }

      reservation.pickedAt = new Date();
      reservation.pickedBy = userId;
      await reservationRepo.save(reservation);
      await recordAuditEvent(manager, {
        traceId: jobOrder.code,
        action: 'PICK',
        targetType: 'MATERIAL_JOB_ORDER',
        targetId: jobOrder.id,
        performedBy: userId,
        after: { reservationId: reservation.id, scannedCode: dto.scannedCode },
      });

      const outstanding = await reservationRepo
        .createQueryBuilder('reservation')
        .innerJoin('reservation.productionPlanLine', 'line')
        .where('line.productionPlanId = :planId', {
          planId: jobOrder.productionPlanId,
        })
        .andWhere('reservation.releasedAt IS NULL')
        .andWhere('reservation.pickedAt IS NULL')
        .getCount();

      if (outstanding === 0 && jobOrder.status === 'WAITING_PICKING') {
        jobOrder.status = 'READY_TO_ISSUE';
        jobOrder.version += 1;
        await manager.getRepository(MaterialJobOrder).save(jobOrder);
      }
    });
    return this.findOne(id);
  }

  // ------------------------------------------------------------------- issue

  async issue(id: string, dto: IssueMaterialJobOrderDto, userId: string) {
    await this.dataSource.transaction(async (manager) => {
      const jobOrder = await this.lockJobOrder(manager, id);
      if (jobOrder.version !== dto.version) {
        throw new ConflictException(
          'ใบจัดงานนี้ถูกแก้ไขโดยผู้อื่นแล้ว กรุณาโหลดข้อมูลใหม่',
        );
      }
      if (!['READY_TO_ISSUE', 'PARTIALLY_ISSUED'].includes(jobOrder.status)) {
        throw new ConflictException(
          'ใบจัดงานนี้ไม่อยู่ในสถานะที่จ่ายออกได้ (ต้องหยิบสินค้าให้ครบก่อน)',
        );
      }

      const plan = await manager.getRepository(ProductionPlan).findOne({
        where: { id: jobOrder.productionPlanId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!plan || plan.status !== 'APPROVED') {
        throw new ConflictException('แผนการผลิตนี้ไม่อยู่ในสถานะที่จ่ายออกได้');
      }

      const reservationIds = dto.items.map((item) => item.reservationId);
      if (new Set(reservationIds).size !== reservationIds.length) {
        throw new BadRequestException('รายการที่จ่ายออกมีรหัสซ้ำกัน');
      }

      // Lock only reservations that belong to THIS Job Order's plan — this
      // is what enforces "จ่ายออกเฉพาะ Package ที่ Reserve ไว้ให้ Job Order
      // นี้เท่านั้น": there is no FIFO re-allocation anywhere in this method.
      const reservationRepo = manager.getRepository(ProductionPlanReservation);
      const reservations = await reservationRepo
        .createQueryBuilder('reservation')
        .innerJoin('reservation.productionPlanLine', 'line')
        .innerJoinAndSelect('reservation.materialReceivingPackage', 'pkg')
        .innerJoinAndSelect('pkg.materialReceiving', 'receiving')
        .where('reservation.id IN (:...ids)', { ids: reservationIds })
        .andWhere('line.productionPlanId = :planId', { planId: plan.id })
        .andWhere('reservation.releasedAt IS NULL')
        .orderBy('pkg.id', 'ASC')
        .setLock('pessimistic_write', undefined, ['reservation'])
        .getMany();
      if (reservations.length !== reservationIds.length) {
        throw new NotFoundException(
          'บางรายการไม่พบในใบจัดงานนี้ หรือถูกปล่อยไปแล้ว',
        );
      }

      const quantityByReservation = new Map(
        dto.items.map((item) => [item.reservationId, toScaled(item.quantity)]),
      );

      // Lock the receiving packages themselves (id ASC — matches the lock
      // order used by approve()/ordinary disbursement) before mutating
      // remaining_quantity/status.
      const packageIds = [
        ...new Set(reservations.map((r) => r.materialReceivingPackageId)),
      ];
      const lockedPackages = await manager
        .getRepository(MaterialReceivingPackage)
        .createQueryBuilder('pkg')
        .where('pkg.id IN (:...packageIds)', { packageIds })
        .orderBy('pkg.id', 'ASC')
        .setLock('pessimistic_write', undefined, ['pkg'])
        .getMany();
      const packageById = new Map(lockedPackages.map((pkg) => [pkg.id, pkg]));

      for (const reservation of reservations) {
        const quantity = quantityByReservation.get(reservation.id) ?? 0n;
        if (quantity <= 0n) {
          throw new BadRequestException('จำนวนที่จ่ายออกต้องมากกว่า 0');
        }
        const outstanding =
          toScaled(reservation.reservedQuantity) -
          toScaled(reservation.issuedQuantity);
        if (quantity > outstanding) {
          throw new BadRequestException(
            `จำนวนที่จ่ายออกเกินจำนวนคงเหลือของรายการ ${reservation.id} (คงเหลือ ${fromScaled(outstanding)})`,
          );
        }
        const pkg = packageById.get(reservation.materialReceivingPackageId);
        if (!pkg || !['in_stock', 'partial'].includes(pkg.status)) {
          throw new ConflictException(
            `กล่อง/QR ที่ถูกจองไว้ (${pkg?.lotDetailNo ?? reservation.materialReceivingPackageId}) ใช้งานไม่ได้แล้ว — กรุณายกเลิกแผนแล้วสร้างใหม่`,
          );
        }
        if (toScaled(pkg.remainingQuantity) < quantity) {
          throw new ConflictException(
            `กล่อง ${pkg.lotDetailNo} มีของเหลือไม่พอสำหรับจำนวนที่จะจ่ายออก`,
          );
        }
      }

      const materialIds = [
        ...new Set(
          reservations.map(
            (r) => r.materialReceivingPackage.materialReceiving.materialId,
          ),
        ),
      ];
      const materials = await manager.getRepository(Material).find({
        where: { id: In(materialIds) },
      });
      const materialById = new Map(materials.map((m) => [m.id, m]));

      const reservationsByMaterial = new Map<
        string,
        ProductionPlanReservation[]
      >();
      for (const reservation of reservations) {
        const materialId =
          reservation.materialReceivingPackage.materialReceiving.materialId;
        const rows = reservationsByMaterial.get(materialId) ?? [];
        rows.push(reservation);
        reservationsByMaterial.set(materialId, rows);
      }

      const today = new Date().toISOString().slice(0, 10);
      const disbursementNo = await allocateDisbursementNo(manager, today);
      const disbursementRepo = manager.getRepository(MaterialsDisbursement);
      const disbursement = await disbursementRepo.save(
        disbursementRepo.create({
          traceId: createTraceId('ISS'),
          disbursementNo,
          disbursementType: 'production',
          disbursementDate: today,
          status: 'confirmed',
          reason: `Material Job Order ${jobOrder.code}`,
          departmentId: null,
          productionOrder: plan.code,
          referenceNo: jobOrder.code,
          requestedBy: null,
          approvedBy: userId,
          attachmentUrl: null,
          attachmentName: null,
          remark: plan.remark,
          productionPlanId: plan.id,
          materialJobOrderId: jobOrder.id,
          confirmedBy: userId,
          confirmedAt: new Date(),
          cancelledBy: null,
          cancelledAt: null,
          cancelReason: null,
          createdBy: userId,
        }),
      );

      const itemRepo = manager.getRepository(MaterialDisbursementItem);
      const allocationRepo = manager.getRepository(MaterialDisbursementPackage);
      const packageRepo = manager.getRepository(MaterialReceivingPackage);
      const balanceRepo = manager.getRepository(StockBalance);

      for (const [materialId, materialReservations] of reservationsByMaterial) {
        const total = materialReservations.reduce(
          (sum, reservation) =>
            sum + (quantityByReservation.get(reservation.id) ?? 0n),
          0n,
        );
        const item = await itemRepo.save(
          itemRepo.create({
            disbursementId: disbursement.id,
            materialId,
            requestedQuantity: fromScaled(total),
            disbursedQuantity: fromScaled(total),
            createdBy: userId,
          }),
        );

        const balance = await balanceRepo.findOne({
          where: { materialId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!balance || toScaled(balance.quantity) < total) {
          throw new ConflictException(
            `สต็อกคงเหลือของวัสดุ ${materialId} ไม่พอ`,
          );
        }

        let runningBalance = toScaled(balance.quantity);
        let fifoOrder = 0;
        for (const reservation of materialReservations) {
          const quantity = quantityByReservation.get(reservation.id) ?? 0n;
          const pkg = packageById.get(reservation.materialReceivingPackageId)!;
          const receiving =
            reservation.materialReceivingPackage.materialReceiving;

          fifoOrder += 1;
          const newRemaining = toScaled(pkg.remainingQuantity) - quantity;
          pkg.remainingQuantity = fromScaled(newRemaining);
          pkg.status = newRemaining === 0n ? 'issued' : 'partial';
          await packageRepo.save(pkg);

          await allocationRepo.save(
            allocationRepo.create({
              disbursementItemId: item.id,
              packageId: pkg.id,
              disbursedQuantity: fromScaled(quantity),
              fifoOrder,
              reversedAt: null,
              reversedBy: null,
              productionPlanReservationId: reservation.id,
              createdBy: userId,
            }),
          );

          const before = runningBalance;
          runningBalance -= quantity;
          await recordStockMovement(manager, {
            traceId: disbursement.traceId,
            transactionType: 'ISSUE',
            materialId,
            referenceType: 'MATERIALS_DISBURSEMENT',
            referenceId: disbursement.id,
            referenceLotNo: receiving.internalLotNo,
            mainQrId: receiving.id,
            subQrId: pkg.id,
            unitId: materialById.get(materialId)?.unitId ?? null,
            productionOrder: plan.code,
            referenceNo: jobOrder.code,
            quantityBefore: fromScaled(before),
            quantityIn: fromScaled(0n),
            quantityOut: fromScaled(quantity),
            quantityAfter: fromScaled(runningBalance),
            remark: `Issued from Job Order ${jobOrder.code} (Production Plan ${plan.code})`,
            performedBy: userId,
          });

          reservation.issuedQuantity = fromScaled(
            toScaled(reservation.issuedQuantity) + quantity,
          );
          const outstanding =
            toScaled(reservation.reservedQuantity) -
            toScaled(reservation.issuedQuantity);
          if (outstanding <= 0n) {
            reservation.releasedAt = new Date();
            reservation.releaseType = 'ISSUED';
            reservation.releasedBy = userId;
          }
          await reservationRepo.save(reservation);
        }
        balance.quantity = fromScaled(runningBalance);
        balance.lastMovementAt = new Date();
        await balanceRepo.save(balance);
      }

      const remainingOutstanding = await reservationRepo
        .createQueryBuilder('reservation')
        .innerJoin('reservation.productionPlanLine', 'line')
        .where('line.productionPlanId = :planId', { planId: plan.id })
        .andWhere('reservation.releasedAt IS NULL')
        .getCount();

      jobOrder.version += 1;
      if (remainingOutstanding === 0) {
        jobOrder.status = 'ISSUED';
        jobOrder.completedBy = userId;
        jobOrder.completedAt = new Date();
        plan.status = 'ISSUED';
        plan.issuedBy = userId;
        plan.issuedAt = new Date();
        await manager.getRepository(ProductionPlan).save(plan);
      } else {
        jobOrder.status = 'PARTIALLY_ISSUED';
      }
      await manager.getRepository(MaterialJobOrder).save(jobOrder);

      await recordAuditEvent(manager, {
        traceId: jobOrder.code,
        action: 'ISSUE',
        targetType: 'MATERIAL_JOB_ORDER',
        targetId: jobOrder.id,
        performedBy: userId,
        after: {
          disbursementId: disbursement.id,
          disbursementNo: disbursement.disbursementNo,
          status: jobOrder.status,
        },
      });
      if (jobOrder.status === 'ISSUED') {
        await recordAuditEvent(manager, {
          traceId: jobOrder.code,
          action: 'STATUS_CHANGE',
          targetType: 'MATERIAL_JOB_ORDER',
          targetId: jobOrder.id,
          performedBy: userId,
          after: { status: 'ISSUED' },
        });
        await recordAuditEvent(manager, {
          traceId: plan.code,
          action: 'STATUS_CHANGE',
          targetType: 'PRODUCTION_PLAN',
          targetId: plan.id,
          performedBy: userId,
          before: { status: 'APPROVED' },
          after: { status: 'ISSUED', jobOrderId: jobOrder.id },
        });
      }
    });
    return this.findOne(id);
  }

  /** Cheap summary used by ProductionPlansService to embed a plan's linked JO. */
  async findSummaryByPlanId(
    planId: string,
  ): Promise<{ id: string; code: string; status: string } | null> {
    const jobOrder = await this.jobOrderRepository.findOne({
      where: { productionPlanId: planId },
    });
    if (!jobOrder) return null;
    return { id: jobOrder.id, code: jobOrder.code, status: jobOrder.status };
  }

  async findSummaryByPlanIds(
    planIds: string[],
  ): Promise<Map<string, { id: string; code: string; status: string }>> {
    if (planIds.length === 0) return new Map();
    const jobOrders = await this.jobOrderRepository.find({
      where: { productionPlanId: In(planIds) },
    });
    return new Map(
      jobOrders.map((jo) => [
        jo.productionPlanId,
        { id: jo.id, code: jo.code, status: jo.status },
      ]),
    );
  }

  // ------------------------------------------------------------------ reads

  async findAll(query: ListMaterialJobOrdersQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const statuses = parseStatusFilter(query.status);

    const qb = this.jobOrderRepository
      .createQueryBuilder('jo')
      .leftJoinAndSelect('jo.productionPlan', 'plan')
      .leftJoinAndSelect('plan.lines', 'line')
      .leftJoinAndSelect('line.product', 'product');

    if (query.search) {
      qb.andWhere(
        '(jo.code ILIKE :search OR plan.code ILIKE :search OR product.code ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }
    if (statuses.length > 0) {
      qb.andWhere('jo.status IN (:...statuses)', { statuses });
    }
    if (query.approvedDateFrom) {
      qb.andWhere('plan.approvedAt >= :approvedDateFrom', {
        approvedDateFrom: query.approvedDateFrom,
      });
    }
    if (query.approvedDateTo) {
      qb.andWhere('plan.approvedAt <= :approvedDateTo', {
        approvedDateTo: `${query.approvedDateTo} 23:59:59`,
      });
    }

    const [jobOrders, totalItems] = await qb
      .orderBy('jo.createdAt', 'DESC')
      .addOrderBy('jo.id', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    const planIds = jobOrders.map((jo) => jo.productionPlanId);
    const countsByPlan = planIds.length
      ? await this.loadReservationCounts(planIds)
      : new Map<string, { materials: number; packages: number }>();

    return {
      items: jobOrders.map((jo) => ({
        id: jo.id,
        code: jo.code,
        status: jo.status,
        productionPlan: {
          id: jo.productionPlan.id,
          code: jo.productionPlan.code,
          approvedAt: jo.productionPlan.approvedAt,
          approvedBy: jo.productionPlan.approvedBy,
        },
        products: jo.productionPlan.lines.map((line) => ({
          productCode: line.product.code,
          productName: line.product.name,
          quantity: line.quantity,
          needByDate: line.needByDate,
        })),
        materialCount: countsByPlan.get(jo.productionPlanId)?.materials ?? 0,
        packageCount: countsByPlan.get(jo.productionPlanId)?.packages ?? 0,
        createdBy: jo.createdBy,
        createdAt: jo.createdAt,
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
    return this.buildDetail(await this.findOneEntity(id));
  }

  private async findOneEntity(id: string): Promise<MaterialJobOrder> {
    const jobOrder = await this.jobOrderRepository.findOne({ where: { id } });
    if (!jobOrder) throw new NotFoundException('Material Job Order not found');
    return jobOrder;
  }

  private async buildDetail(jobOrder: MaterialJobOrder) {
    const plan = await this.dataSource.getRepository(ProductionPlan).findOne({
      where: { id: jobOrder.productionPlanId },
      relations: ['lines', 'lines.product', 'lines.bom'],
      order: { lines: { id: 'ASC' } },
    });
    if (!plan) throw new NotFoundException('Production Plan not found');

    const reservations = await this.dataSource
      .getRepository(ProductionPlanReservation)
      .createQueryBuilder('reservation')
      .innerJoinAndSelect('reservation.productionPlanLine', 'line')
      .innerJoinAndSelect('reservation.materialReceivingPackage', 'pkg')
      .innerJoinAndSelect('pkg.materialReceiving', 'receiving')
      .innerJoinAndSelect('receiving.material', 'material')
      .where('line.productionPlanId = :planId', { planId: plan.id })
      .orderBy('receiving.materialId', 'ASC')
      .addOrderBy('receiving.receiveDate', 'ASC')
      .addOrderBy('pkg.id', 'ASC')
      .getMany();

    const materialTotals = new Map<
      string,
      {
        code: string;
        name: string;
        required: bigint;
        reserved: bigint;
        issued: bigint;
      }
    >();
    for (const reservation of reservations) {
      const material =
        reservation.materialReceivingPackage.materialReceiving.material;
      const entry = materialTotals.get(material.id) ?? {
        code: material.code,
        name: material.name,
        required: 0n,
        reserved: 0n,
        issued: 0n,
      };
      entry.reserved += toScaled(reservation.reservedQuantity);
      entry.issued += toScaled(reservation.issuedQuantity);
      materialTotals.set(material.id, entry);
    }

    const disbursements = await this.dataSource
      .getRepository(MaterialsDisbursement)
      .find({
        where: { materialJobOrderId: jobOrder.id },
        relations: ['items'],
        order: { createdAt: 'ASC' },
      });

    return {
      id: jobOrder.id,
      code: jobOrder.code,
      status: jobOrder.status,
      version: jobOrder.version,
      printCount: jobOrder.printCount,
      lastPrintedBy: jobOrder.lastPrintedBy,
      lastPrintedAt: jobOrder.lastPrintedAt,
      completedBy: jobOrder.completedBy,
      completedAt: jobOrder.completedAt,
      cancelledBy: jobOrder.cancelledBy,
      cancelledAt: jobOrder.cancelledAt,
      cancelReason: jobOrder.cancelReason,
      createdBy: jobOrder.createdBy,
      createdAt: jobOrder.createdAt,
      productionPlan: {
        id: plan.id,
        code: plan.code,
        title: plan.title,
        status: plan.status,
        approvedBy: plan.approvedBy,
        approvedAt: plan.approvedAt,
        lines: plan.lines.map((line) => ({
          id: line.id,
          productId: line.productId,
          productCode: line.product.code,
          productName: line.product.name,
          quantity: line.quantity,
          needByDate: line.needByDate,
          bomVersion: line.bom?.version ?? null,
        })),
      },
      materials: [...materialTotals.values()].map((entry) => ({
        materialCode: entry.code,
        materialName: entry.name,
        reserved: fromScaled(entry.reserved),
        issued: fromScaled(entry.issued),
        outstanding: fromScaled(entry.reserved - entry.issued),
      })),
      pickLines: reservations.map((reservation) => {
        const pkg = reservation.materialReceivingPackage;
        const receiving = pkg.materialReceiving;
        return {
          reservationId: reservation.id,
          qrCode: pkg.lotDetailNo,
          materialCode: receiving.material.code,
          materialName: receiving.material.name,
          internalLotNo: receiving.internalLotNo,
          supplierLotNo: receiving.supplierLotNo,
          packageNo: pkg.packageNo,
          loadingPointId: receiving.material.loadingPointId,
          currentQuantity: pkg.remainingQuantity,
          reservedQuantity: reservation.reservedQuantity,
          issuedQuantity: reservation.issuedQuantity,
          outstandingQuantity: fromScaled(
            toScaled(reservation.reservedQuantity) -
              toScaled(reservation.issuedQuantity),
          ),
          pickedAt: reservation.pickedAt,
          pickedBy: reservation.pickedBy,
          releasedAt: reservation.releasedAt,
          status: pkg.status,
        };
      }),
      disbursements: disbursements.map((d) => ({
        id: d.id,
        disbursementNo: d.disbursementNo,
        status: d.status,
        confirmedAt: d.confirmedAt,
        confirmedBy: d.confirmedBy,
      })),
    };
  }

  private async loadReservationCounts(
    planIds: string[],
  ): Promise<Map<string, { materials: number; packages: number }>> {
    const rows = await this.dataSource.query<
      Array<{
        plan_id: string;
        material_count: number;
        package_count: number;
      }>
    >(
      `
        SELECT
          line.production_plan_id AS plan_id,
          COUNT(DISTINCT receiving.material_id)::int AS material_count,
          COUNT(DISTINCT reservation.material_receiving_package_id)::int AS package_count
        FROM inventory.production_plan_reservations reservation
        INNER JOIN inventory.production_plan_lines line
          ON line.id = reservation.production_plan_line_id
        INNER JOIN inventory.material_receiving_packages pkg
          ON pkg.id = reservation.material_receiving_package_id
        INNER JOIN inventory.material_receivings receiving
          ON receiving.id = pkg.material_receiving_id
        WHERE line.production_plan_id = ANY($1::bigint[])
        GROUP BY line.production_plan_id
      `,
      [planIds],
    );
    return new Map(
      rows.map((row) => [
        row.plan_id,
        { materials: row.material_count, packages: row.package_count },
      ]),
    );
  }

  // ----------------------------------------------------------------- helpers

  private async lockJobOrder(
    manager: EntityManager,
    id: string,
  ): Promise<MaterialJobOrder> {
    const jobOrder = await manager.getRepository(MaterialJobOrder).findOne({
      where: { id },
      lock: { mode: 'pessimistic_write' },
    });
    if (!jobOrder) throw new NotFoundException('Material Job Order not found');
    return jobOrder;
  }

  private async allocateCode(
    manager: EntityManager,
    date: Date,
  ): Promise<string> {
    const datePart = date.toISOString().slice(0, 10).replaceAll('-', '');
    const prefix = `JO-${datePart}-`;
    await manager.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [prefix]);
    const rows = (await manager.query(
      `SELECT COALESCE(MAX(RIGHT(code, 4)::integer), 0) AS last_number
       FROM inventory.material_job_orders
       WHERE code LIKE $1`,
      [`${prefix}%`],
    )) as unknown as Array<{ last_number: number | string }>;
    const next = Number(rows[0]?.last_number ?? 0) + 1;
    return `${prefix}${String(next).padStart(4, '0')}`;
  }
}
