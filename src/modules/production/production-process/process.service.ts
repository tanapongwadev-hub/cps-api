import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { recordAuditEvent } from '../../../common/stock-ledger';
import {
  ProductionOrder,
  ProductionOrderLine,
} from '../../production-orders/production-order.entity';
import { allocateFifo, InsufficientQuantityError } from '../domain/allocation';
import {
  ProductionDay,
  productionDayOf,
  validateProductionDay,
} from '../domain/production-day';
import { ProcessWip } from '../entities/process-wip.entity';
import { ProductionLot } from '../entities/production-lot.entity';
import { ProductionTransaction } from '../entities/production-transaction.entity';
import { LotService } from '../production-lot/lot.service';
import { LedgerService } from '../production-transaction/ledger.service';
import { WipService } from '../production-wip/wip.service';
import { loadWorkflowSteps, WorkflowStepInfo } from '../workflow-steps';
import { ProduceDto } from './dto/produce.dto';

export interface ProduceResult {
  /** true when this requestId was already processed (nothing written). */
  replayed: boolean;
  lot: {
    id: string;
    lotNo: string;
    lotType: string;
    stepIndex: number;
    processCode: string;
    producedQty: number;
    remainingQty: number;
    productionDate: string;
    shift: string;
    isNew: boolean;
  };
  step: { stepIndex: number; code: string; name: string; waitingQty: number };
  line: { id: string; producedQty: number };
}

@Injectable()
export class ProcessService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly lots: LotService,
    private readonly wip: WipService,
    private readonly ledger: LedgerService,
  ) {}

  /**
   * Record real output at a step: draws `goodQty` from the step's WIP (FIFO)
   * into the open lot of this production day/shift — all in one transaction
   * with the ledger and audit entries. Phase 2: first step only (ORIGIN lots);
   * later steps, rejects and MANUAL allocation come in Phases 3–4.
   */
  async produce(
    lineId: string,
    stepIndex: number,
    dto: ProduceDto,
    userId: string,
  ): Promise<ProduceResult> {
    const now = new Date();
    const current = productionDayOf(now);
    const day: ProductionDay = dto.productionDate
      ? { productionDate: dto.productionDate, shift: dto.shift ?? 'A' }
      : current;
    const dayError = validateProductionDay(day, now);
    if (dayError) throw new ConflictException(dayError);

    return this.dataSource.transaction(async (manager) => {
      // One line at a time: every produce/transfer of a line queues here,
      // so concurrent users can never draw the same WIP twice.
      const line = await manager.getRepository(ProductionOrderLine).findOne({
        where: { id: lineId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!line)
        throw new NotFoundException(`ไม่พบรายการสั่งผลิต id ${lineId}`);
      const order = await manager
        .getRepository(ProductionOrder)
        .findOneOrFail({ where: { id: line.productionOrderId } });
      if (order.trackingModel !== 'LOT') {
        throw new ConflictException(
          'ใบสั่งผลิตนี้ใช้ระบบกล่องแบบเดิม บันทึกผลิตแบบ Lot ไม่ได้',
        );
      }
      if (order.status === 'COMPLETED') {
        throw new ConflictException('ใบสั่งผลิตนี้เสร็จสิ้นแล้ว');
      }
      const steps = await loadWorkflowSteps(manager, line.workflowId);
      const step = steps[stepIndex];
      if (!step) {
        throw new NotFoundException(`ไม่พบขั้นตอนที่ ${stepIndex + 1}`);
      }
      if (stepIndex !== 0) {
        throw new ConflictException(
          'ตอนนี้บันทึกผลิตแบบ Lot ได้เฉพาะขั้นตอนแรก (ขั้นถัดไปเปิดใน Phase 3)',
        );
      }

      // Idempotency: the same request already produced → return it as is.
      const done = await manager.getRepository(ProductionTransaction).findOne({
        where: {
          requestId: dto.requestId,
          transactionType: 'PROCESS_OUTPUT',
          productionOrderLineId: line.id,
        },
      });
      if (done?.targetLotId) {
        return this.result(manager, line, step, done.targetLotId, true, false);
      }

      const rows = await this.wip.lockOpenRows(manager, line.id, stepIndex);
      let allocations: ReturnType<typeof allocateFifo>;
      try {
        allocations = allocateFifo(
          rows.map((r) => ({ id: r.id, remaining: r.qtyRemaining })),
          dto.goodQty,
        );
      } catch (err) {
        if (err instanceof InsufficientQuantityError) {
          throw new ConflictException(
            `จำนวนเกินงานรอผลิต (รอผลิตอยู่ ${err.available} ชิ้น)`,
          );
        }
        throw err;
      }

      const { lot, isNew } = await this.lots.addOriginOutput(
        manager,
        { order, line, step, day, userId },
        dto.goodQty,
      );

      const wipRepo = manager.getRepository(ProcessWip);
      for (const allocation of allocations) {
        const row = rows.find((r) => r.id === allocation.id)!;
        this.wip.consumeForOutput(row, allocation.qty);
        await wipRepo.save(row);
        await this.ledger.write(
          manager,
          {
            requestId: dto.requestId,
            productionOrderId: order.id,
            productionOrderLineId: line.id,
            stepIndex,
            processStepId: step.processStepId,
            transactionType: 'PROCESS_OUTPUT',
            sourceWipId: row.id,
            targetLotId: lot.id,
            qty: allocation.qty,
            transactionDate: day.productionDate,
            shiftKey: day.shift,
            allocationMode: 'FIFO',
            remark: dto.remark?.trim() || null,
            operatorId: userId,
          },
          [{ originLotId: lot.id, qty: allocation.qty }],
        );
      }

      line.producedQty += dto.goodQty;
      await manager.getRepository(ProductionOrderLine).save(line);

      await recordAuditEvent(manager, {
        traceId: lot.lotNo,
        action: isNew ? 'CREATE' : 'UPDATE',
        eventName: 'production.lot.produced',
        targetType: 'PRODUCTION_LOT',
        targetId: lot.id,
        performedBy: userId,
        requestId: dto.requestId,
        after: {
          lotNo: lot.lotNo,
          productionOrder: order.code,
          step: step.code,
          qty: dto.goodQty,
          productionDate: day.productionDate,
          shift: day.shift,
          lotProducedQty: lot.producedQty,
          origins: [{ lotNo: lot.lotNo, qty: dto.goodQty }],
        },
      });

      return this.result(manager, line, step, lot.id, false, isNew);
    });
  }

  private async result(
    manager: EntityManager,
    line: ProductionOrderLine,
    step: WorkflowStepInfo,
    lotId: string,
    replayed: boolean,
    isNew: boolean,
  ): Promise<ProduceResult> {
    const lot = await manager
      .getRepository(ProductionLot)
      .findOneOrFail({ where: { id: lotId } });
    const waiting = (await manager.query(
      `SELECT COALESCE(SUM(qty_remaining), 0)::int AS waiting
       FROM inventory.process_wip
       WHERE production_order_line_id = $1 AND step_index = $2 AND status = 'OPEN'`,
      [line.id, step.index],
    )) as unknown as Array<{ waiting: number }>;
    return {
      replayed,
      lot: {
        id: lot.id,
        lotNo: lot.lotNo,
        lotType: lot.lotType,
        stepIndex: lot.stepIndex,
        processCode: lot.processCode,
        producedQty: lot.producedQty,
        remainingQty: lot.remainingQty,
        productionDate: lot.productionDate,
        shift: lot.shiftKey,
        isNew,
      },
      step: {
        stepIndex: step.index,
        code: step.code,
        name: step.name,
        waitingQty: waiting[0].waiting,
      },
      line: { id: line.id, producedQty: line.producedQty },
    };
  }

  /** Lots of an order line, by step then production day/shift. */
  async listLineLots(lineId: string) {
    const lots = await this.dataSource.getRepository(ProductionLot).find({
      where: { productionOrderLineId: lineId },
      order: {
        stepIndex: 'ASC',
        productionDate: 'ASC',
        shiftKey: 'ASC',
        id: 'ASC',
      },
    });
    return lots.map((lot) => ({
      id: lot.id,
      lotNo: lot.lotNo,
      lotType: lot.lotType,
      stepIndex: lot.stepIndex,
      processCode: lot.processCode,
      producedQty: lot.producedQty,
      remainingQty: lot.remainingQty,
      productionDate: lot.productionDate,
      shift: lot.shiftKey,
      status: lot.status,
      outputClosed: lot.outputClosedAt !== null,
    }));
  }
}
