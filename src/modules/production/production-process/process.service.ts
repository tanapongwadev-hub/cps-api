import {
  BadRequestException,
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
import { allocateFifo } from '../domain/allocation';
import {
  ProductionDay,
  productionDayOf,
  validateProductionDay,
} from '../domain/production-day';
import { ProcessWip } from '../entities/process-wip.entity';
import { LotType, ProductionLot } from '../entities/production-lot.entity';
import { ProductionTransaction } from '../entities/production-transaction.entity';
import { LotService } from '../production-lot/lot.service';
import {
  LedgerService,
  OriginQty,
} from '../production-transaction/ledger.service';
import { WipService } from '../production-wip/wip.service';
import { loadWorkflowSteps, WorkflowStepInfo } from '../workflow-steps';
import { ProduceDto } from './dto/produce.dto';

export interface ProduceResult {
  /** true when this requestId was already processed (nothing written). */
  replayed: boolean;
  /** null when only rejects were recorded. */
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
    origins: Array<{ lotNo: string; qty: number; qtyRemaining: number }>;
  } | null;
  step: { stepIndex: number; code: string; name: string; waitingQty: number };
  line: {
    id: string;
    producedQty: number;
    receivedQty: number;
    rejectedQty: number;
  };
}

type Draw =
  | { kind: 'GOOD'; qty: number }
  | { kind: 'REJECT'; qty: number; reasonId: string };

function lotTypeFor(step: WorkflowStepInfo): LotType {
  if (step.index === 0) return 'ORIGIN';
  if (step.receivingType === 'FG') return 'FG';
  if (step.receivingType === 'STORE') return 'STORE';
  return 'PROCESS';
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
   * Record real output (and rejects) at a step. Draws good + reject pieces
   * from the step's WIP, oldest first (FIFO); good pieces go into the open lot
   * of this production day/shift, carrying the exact origin pieces they came
   * from; rejects are scrapped with their reason and origins. Everything —
   * WIP, lot, origins, lineage, ledger, counters, audit — is written in one
   * transaction while the order line is locked.
   */
  async produce(
    lineId: string,
    stepIndex: number,
    dto: ProduceDto,
    userId: string,
  ): Promise<ProduceResult> {
    const rejects = (dto.rejects ?? []).filter((r) => r.qty > 0);
    const rejectTotal = rejects.reduce((sum, r) => sum + r.qty, 0);
    if (dto.goodQty + rejectTotal < 1) {
      throw new BadRequestException('ต้องบันทึกจำนวนอย่างน้อย 1 ชิ้น');
    }
    const now = new Date();
    const day: ProductionDay = dto.productionDate
      ? { productionDate: dto.productionDate, shift: dto.shift ?? 'A' }
      : productionDayOf(now);
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

      // Idempotency: the same request already ran → return it as is.
      const done = await manager.getRepository(ProductionTransaction).findOne({
        where: { requestId: dto.requestId, productionOrderLineId: line.id },
        order: { id: 'ASC' },
      });
      if (done) {
        const lotTx = await manager
          .getRepository(ProductionTransaction)
          .findOne({
            where: {
              requestId: dto.requestId,
              productionOrderLineId: line.id,
            },
            order: { targetLotId: 'ASC' },
          });
        return this.result(
          manager,
          line,
          step,
          lotTx?.targetLotId ?? null,
          true,
          false,
        );
      }

      if (rejects.length) await this.assertRejectReasons(manager, rejects);

      const rows = await this.wip.lockOpenRows(manager, line.id, stepIndex);
      const available = rows.reduce((sum, r) => sum + r.qtyRemaining, 0);
      if (dto.goodQty + rejectTotal > available) {
        throw new ConflictException(
          `จำนวนเกินงานรอผลิต (รอผลิตอยู่ ${available} ชิ้น)`,
        );
      }
      const originsByWip = await this.wip.lockOrigins(
        manager,
        rows.map((r) => r.id),
      );

      const lotType = lotTypeFor(step);
      const bucket = { order, line, step, day, userId };
      let lot: ProductionLot | null = null;
      let isNew = false;
      if (dto.goodQty > 0) {
        ({ lot, isNew } =
          lotType === 'ORIGIN'
            ? await this.lots.addOriginOutput(manager, bucket, dto.goodQty)
            : await this.lots.addOutput(manager, bucket, lotType, dto.goodQty));
      }

      const draws: Draw[] = [
        ...(dto.goodQty > 0
          ? [{ kind: 'GOOD' as const, qty: dto.goodQty }]
          : []),
        ...rejects.map((r) => ({
          kind: 'REJECT' as const,
          qty: r.qty,
          reasonId: r.reasonId,
        })),
      ];
      const wipRepo = manager.getRepository(ProcessWip);
      const goodOrigins = new Map<string, number>();
      const rejectOrigins = new Map<string, number>();

      for (const draw of draws) {
        const allocations = allocateFifo(
          rows.map((r) => ({ id: r.id, remaining: r.qtyRemaining })),
          draw.qty,
        );
        for (const allocation of allocations) {
          const row = rows.find((r) => r.id === allocation.id)!;
          let origins: OriginQty[];
          if (lotType === 'ORIGIN') {
            // First step: good pieces become their own origin; rejected
            // pieces never became a lot, so they have no origin.
            origins =
              draw.kind === 'GOOD' && lot
                ? [{ originLotId: lot.id, qty: allocation.qty }]
                : [];
          } else {
            origins = await this.wip.takeOrigins(
              manager,
              originsByWip.get(row.id) ?? [],
              allocation.qty,
            );
          }

          if (draw.kind === 'GOOD') {
            this.wip.consumeForOutput(row, allocation.qty);
          } else {
            this.wip.consumeForReject(row, allocation.qty);
          }
          await wipRepo.save(row);

          const tx = await this.ledger.write(
            manager,
            {
              requestId: dto.requestId,
              productionOrderId: order.id,
              productionOrderLineId: line.id,
              stepIndex,
              processStepId: step.processStepId,
              transactionType:
                draw.kind === 'REJECT'
                  ? 'REJECT'
                  : lotType === 'FG' || lotType === 'STORE'
                    ? 'FG_RECEIVE'
                    : 'PROCESS_OUTPUT',
              sourceWipId: row.id,
              sourceLotId: row.sourceLotId,
              targetLotId: draw.kind === 'GOOD' ? (lot?.id ?? null) : null,
              rejectReasonId: draw.kind === 'REJECT' ? draw.reasonId : null,
              qty: allocation.qty,
              transactionDate: day.productionDate,
              shiftKey: day.shift,
              allocationMode: 'FIFO',
              remark: dto.remark?.trim() || null,
              operatorId: userId,
            },
            origins,
          );

          const tally = draw.kind === 'GOOD' ? goodOrigins : rejectOrigins;
          for (const o of origins) {
            tally.set(o.originLotId, (tally.get(o.originLotId) ?? 0) + o.qty);
          }
          if (draw.kind === 'GOOD' && lot && lotType !== 'ORIGIN') {
            await this.lots.addOrigins(manager, lot.id, origins);
            if (row.sourceLotId) {
              await this.lots.addSource(
                manager,
                lot.id,
                row.sourceLotId,
                allocation.qty,
                tx.id,
              );
            }
          }
        }
      }

      if (lotType === 'ORIGIN') line.producedQty += dto.goodQty;
      if (lotType === 'FG' || lotType === 'STORE')
        line.receivedQty += dto.goodQty;
      line.rejectedQty += rejectTotal;
      await manager.getRepository(ProductionOrderLine).save(line);

      await recordAuditEvent(manager, {
        traceId: lot?.lotNo ?? order.code,
        action: isNew ? 'CREATE' : 'UPDATE',
        eventName:
          dto.goodQty > 0
            ? 'production.lot.produced'
            : 'production.lot.rejected',
        targetType: 'PRODUCTION_LOT',
        targetId: lot?.id ?? null,
        performedBy: userId,
        requestId: dto.requestId,
        after: {
          lotNo: lot?.lotNo ?? null,
          productionOrder: order.code,
          step: step.code,
          goodQty: dto.goodQty,
          rejects: rejects.map((r) => ({ reasonId: r.reasonId, qty: r.qty })),
          productionDate: day.productionDate,
          shift: day.shift,
          origins: Object.fromEntries(goodOrigins),
          rejectOrigins: Object.fromEntries(rejectOrigins),
        },
      });

      return this.result(manager, line, step, lot?.id ?? null, false, isNew);
    });
  }

  private async assertRejectReasons(
    manager: EntityManager,
    rejects: Array<{ reasonId: string }>,
  ): Promise<void> {
    const ids = [...new Set(rejects.map((r) => r.reasonId))];
    if (ids.some((id) => !/^\d+$/.test(id))) {
      throw new BadRequestException('รหัสเหตุผลของเสียไม่ถูกต้อง');
    }
    const found = (await manager.query(
      `SELECT id FROM master.reject_reasons WHERE id = ANY($1::bigint[]) AND is_active = true`,
      [ids],
    )) as unknown as Array<{ id: string }>;
    if (found.length !== ids.length) {
      throw new ConflictException(
        'ไม่พบเหตุผลของเสีย หรือเหตุผลถูกปิดใช้งานแล้ว',
      );
    }
  }

  private async result(
    manager: EntityManager,
    line: ProductionOrderLine,
    step: WorkflowStepInfo,
    lotId: string | null,
    replayed: boolean,
    isNew: boolean,
  ): Promise<ProduceResult> {
    const waiting = (await manager.query(
      `SELECT COALESCE(SUM(qty_remaining), 0)::int AS waiting
       FROM inventory.process_wip
       WHERE production_order_line_id = $1 AND step_index = $2 AND status = 'OPEN'`,
      [line.id, step.index],
    )) as unknown as Array<{ waiting: number }>;
    const fresh = await manager
      .getRepository(ProductionOrderLine)
      .findOneOrFail({ where: { id: line.id } });

    let lot: ProduceResult['lot'] = null;
    if (lotId) {
      const row = await manager
        .getRepository(ProductionLot)
        .findOneOrFail({ where: { id: lotId } });
      const origins = await this.lots.originsOf(manager, lotId);
      lot = {
        id: row.id,
        lotNo: row.lotNo,
        lotType: row.lotType,
        stepIndex: row.stepIndex,
        processCode: row.processCode,
        producedQty: row.producedQty,
        remainingQty: row.remainingQty,
        productionDate: row.productionDate,
        shift: row.shiftKey,
        isNew,
        origins: origins.map((o) => ({
          lotNo: o.originLot.lotNo,
          qty: o.qty,
          qtyRemaining: o.qtyRemaining,
        })),
      };
    }
    return {
      replayed,
      lot,
      step: {
        stepIndex: step.index,
        code: step.code,
        name: step.name,
        waitingQty: waiting[0].waiting,
      },
      line: {
        id: fresh.id,
        producedQty: fresh.producedQty,
        receivedQty: fresh.receivedQty,
        rejectedQty: fresh.rejectedQty,
      },
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
