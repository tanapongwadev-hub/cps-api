import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { recordAuditEvent } from '../../../common/stock-ledger';
import { ProductionOrderLine } from '../../production-orders/production-order.entity';
import {
  Allocation,
  allocateBySource,
  allocateFifo,
  InsufficientQuantityError,
} from '../domain/allocation';
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
import { WorkflowStepInfo } from '../workflow-steps';
import { ProduceDto } from './dto/produce.dto';
import { completeLotOrderIfDone } from './completion';
import { lockLotModelLine, stepAt } from './line-context';

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
    const mode = dto.allocationMode ?? 'FIFO';
    if (mode === 'MANUAL' && stepIndex === 0) {
      throw new BadRequestException(
        'ขั้นตอนแรกไม่มี Lot ต้นทางให้เลือก ใช้แบบ FIFO',
      );
    }
    if (mode === 'MANUAL' && dto.goodQty < 1) {
      throw new BadRequestException(
        'เลือก Lot ต้นทางได้เมื่อมีจำนวนดีอย่างน้อย 1 ชิ้น',
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const { line, order, steps } = await lockLotModelLine(manager, lineId);
      const step = stepAt(steps, stepIndex);

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
      let manualGood: Allocation[] | null = null;
      if (mode === 'MANUAL') {
        const picked = allocateBySource(
          rows.map((r) => ({
            id: r.id,
            sourceId: r.sourceLotId,
            remaining: r.qtyRemaining,
          })),
          (dto.allocations ?? []).map((a) => ({ id: a.lotId, qty: a.qty })),
          dto.goodQty,
        );
        if ('error' in picked) throw new ConflictException(picked.error);
        manualGood = picked.allocations;
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
        const allocations =
          draw.kind === 'GOOD' && manualGood
            ? manualGood
            : allocateFifo(
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
              allocationMode: draw.kind === 'GOOD' ? mode : 'FIFO',
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

      await completeLotOrderIfDone(manager, order.id, userId, dto.requestId);
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

  /**
   * Read-only: the source lots waiting at a step (with their origin pieces),
   * oldest first, plus — when `qty` is given — how FIFO would split it across
   * them. Feeds the "เลือก Lot ต้นทาง" form; nothing is locked or written, so
   * the real produce call re-validates everything.
   */
  async allocationPreview(lineId: string, stepIndex: number, qty?: number) {
    const lineRows = (await this.dataSource.query(
      `SELECT o.tracking_model FROM inventory.production_order_lines l
       JOIN inventory.production_orders o ON o.id = l.production_order_id
       WHERE l.id = $1`,
      [lineId],
    )) as unknown as Array<{ tracking_model: string }>;
    if (!lineRows.length) {
      throw new NotFoundException(`ไม่พบรายการสั่งผลิต id ${lineId}`);
    }
    if (lineRows[0].tracking_model !== 'LOT') {
      throw new ConflictException('ใบสั่งผลิตนี้ใช้ระบบกล่องแบบเดิม');
    }

    const wipRows = (await this.dataSource.query(
      `SELECT w.id, w.source_lot_id, w.qty_remaining
       FROM inventory.process_wip w
       WHERE w.production_order_line_id = $1 AND w.step_index = $2
         AND w.status = 'OPEN' AND w.qty_remaining > 0
       ORDER BY w.received_at, w.id`,
      [lineId, stepIndex],
    )) as unknown as Array<{
      id: string;
      source_lot_id: string | null;
      qty_remaining: number;
    }>;
    const lots = (await this.dataSource.query(
      `SELECT DISTINCT l.id, l.lot_no, l.production_date::text AS production_date,
              l.shift_key
       FROM inventory.process_wip w
       JOIN inventory.production_lots l ON l.id = w.source_lot_id
       WHERE w.production_order_line_id = $1 AND w.step_index = $2
         AND w.status = 'OPEN' AND w.qty_remaining > 0`,
      [lineId, stepIndex],
    )) as unknown as Array<{
      id: string;
      lot_no: string;
      production_date: string;
      shift_key: string;
    }>;
    const origins = (await this.dataSource.query(
      `SELECT w.source_lot_id, ol.lot_no, ol.production_date::text AS production_date,
              ol.shift_key, SUM(o.qty_remaining)::int AS qty
       FROM inventory.process_wip_origins o
       JOIN inventory.process_wip w ON w.id = o.wip_id
       JOIN inventory.production_lots ol ON ol.id = o.origin_lot_id
       WHERE w.production_order_line_id = $1 AND w.step_index = $2
         AND w.status = 'OPEN' AND o.qty_remaining > 0
       GROUP BY w.source_lot_id, ol.id, ol.lot_no, ol.production_date, ol.shift_key
       ORDER BY ol.production_date, ol.id`,
      [lineId, stepIndex],
    )) as unknown as Array<{
      source_lot_id: string;
      lot_no: string;
      production_date: string;
      shift_key: string;
      qty: number;
    }>;

    // Source lots in FIFO order of their first waiting row.
    const order: string[] = [];
    const waiting = new Map<string, number>();
    let planQty = 0;
    for (const row of wipRows) {
      const qtyLeft = Number(row.qty_remaining);
      if (row.source_lot_id === null) {
        planQty += qtyLeft;
        continue;
      }
      const id = String(row.source_lot_id);
      if (!waiting.has(id)) order.push(id);
      waiting.set(id, (waiting.get(id) ?? 0) + qtyLeft);
    }
    const lotById = new Map(lots.map((l) => [String(l.id), l]));
    const sources = order.map((id) => {
      const lot = lotById.get(id)!;
      return {
        lotId: id,
        lotNo: lot.lot_no,
        productionDate: lot.production_date,
        shift: lot.shift_key,
        waitingQty: waiting.get(id)!,
        origins: origins
          .filter((o) => String(o.source_lot_id) === id)
          .map((o) => ({
            lotNo: o.lot_no,
            productionDate: o.production_date,
            shift: o.shift_key,
            qty: Number(o.qty),
          })),
      };
    });

    let fifo: Array<{ lotId: string; qty: number }> | null = null;
    let fifoError: string | null = null;
    if (qty !== undefined) {
      try {
        const byRow = allocateFifo(
          wipRows.map((r) => ({
            id: String(r.id),
            remaining: Number(r.qty_remaining),
          })),
          qty,
        );
        const sums = new Map<string, number>();
        for (const a of byRow) {
          const row = wipRows.find((r) => String(r.id) === a.id)!;
          const key =
            row.source_lot_id === null ? '' : String(row.source_lot_id);
          sums.set(key, (sums.get(key) ?? 0) + a.qty);
        }
        fifo = [...sums]
          .filter(([key]) => key !== '')
          .map(([lotId, q]) => ({ lotId, qty: q }));
      } catch (err) {
        if (!(err instanceof InsufficientQuantityError)) throw err;
        fifoError = `จำนวนเกินงานรอผลิต (รอผลิตอยู่ ${err.available} ชิ้น)`;
      }
    }

    return {
      stepIndex,
      waitingQty: planQty + [...waiting.values()].reduce((a, b) => a + b, 0),
      planQty,
      sources,
      fifo,
      fifoError,
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
