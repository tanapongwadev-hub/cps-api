import { ConflictException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { recordAuditEvent } from '../../../common/stock-ledger';
import {
  Allocation,
  allocateFifo,
  InsufficientQuantityError,
  validateManualAllocation,
} from '../domain/allocation';
import {
  ProductionDay,
  productionDayOf,
  validateProductionDay,
} from '../domain/production-day';
import { ProductionLot } from '../entities/production-lot.entity';
import { ProductionTransaction } from '../entities/production-transaction.entity';
import { LotService } from '../production-lot/lot.service';
import { LedgerService } from '../production-transaction/ledger.service';
import { completeLotOrderIfDone } from './completion';
import { loadWipBoxes, type TransferBox } from './wip-boxes';
import { WipService } from '../production-wip/wip.service';
import { WorkflowStepInfo } from '../workflow-steps';
import { TransferDto } from './dto/transfer.dto';
import { lockLotModelLine, stepAt } from './line-context';

export interface TransferResult {
  replayed: boolean;
  fromStep: { stepIndex: number; code: string; readyQty: number };
  toStep: { stepIndex: number; code: string; waitingQty: number };
  transfers: Array<{
    lotNo: string;
    qty: number;
    /** Batch QR of the WIP row this created at the next step. */
    qrCode: string | null;
    /** One box (one QR each) per pack of the batch. */
    boxes: TransferBox[];
    origins: Array<{ lotNo: string; qty: number }>;
  }>;
}

@Injectable()
export class TransferService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly lots: LotService,
    private readonly wip: WipService,
    private readonly ledger: LedgerService,
  ) {}

  /**
   * Sends `qty` produced pieces of a step to the next step. Pieces leave the
   * step's lots (FIFO oldest lot first, or MANUAL per lot) together with the
   * exact origins they carry, and arrive as WIP rows of the next step — one
   * row per source lot, so the next step can still tell its sources apart.
   * Whatever is not sent stays "ready to transfer" in its lot.
   */
  async transfer(
    lineId: string,
    stepIndex: number,
    dto: TransferDto,
    userId: string,
  ): Promise<TransferResult> {
    const mode = dto.allocationMode ?? 'FIFO';
    const now = new Date();
    const day: ProductionDay = dto.transferDate
      ? { productionDate: dto.transferDate, shift: dto.shift ?? 'A' }
      : productionDayOf(now);
    const dayError = validateProductionDay(day, now);
    if (dayError) throw new ConflictException(dayError);

    return this.dataSource.transaction(async (manager) => {
      const { line, order, steps } = await lockLotModelLine(manager, lineId);
      const step = stepAt(steps, stepIndex);
      const next = steps[stepIndex + 1];
      if (!next) {
        throw new ConflictException(
          'ขั้นตอนสุดท้ายส่งต่อไม่ได้ — งานที่รับเข้าแล้วนำไปแพ็กกล่อง',
        );
      }

      const replay = await manager
        .getRepository(ProductionTransaction)
        .findOne({
          where: {
            requestId: dto.requestId,
            productionOrderLineId: line.id,
            transactionType: 'TRANSFER',
          },
        });
      if (replay) {
        return this.result(manager, line.id, step, next, dto.requestId, true);
      }

      const lots = await this.lots.lockReadyLots(manager, line.id, stepIndex);
      const rows = lots.map((l) => ({ id: l.id, remaining: l.remainingQty }));
      let allocations: Allocation[];
      if (mode === 'MANUAL') {
        const chosen = (dto.allocations ?? []).map((a) => ({
          id: a.lotId,
          qty: a.qty,
        }));
        const error = validateManualAllocation(rows, chosen, dto.qty);
        if (error) throw new ConflictException(error);
        allocations = chosen;
      } else {
        try {
          allocations = allocateFifo(rows, dto.qty);
        } catch (err) {
          if (err instanceof InsufficientQuantityError) {
            throw new ConflictException(
              `จำนวนเกินยอดรอส่ง (รอส่งอยู่ ${err.available} ชิ้น)`,
            );
          }
          throw err;
        }
      }

      const lotRepo = manager.getRepository(ProductionLot);
      const audit: Array<{
        lotNo: string;
        qty: number;
        origins: Array<{ lotNo: string; qty: number }>;
      }> = [];
      for (const allocation of allocations) {
        const lot = lots.find((l) => l.id === allocation.id)!;
        const origins = await this.lots.takeOrigins(
          manager,
          lot.id,
          allocation.qty,
        );
        lot.remainingQty -= allocation.qty;
        if (lot.remainingQty === 0) lot.status = 'CONSUMED';
        await lotRepo.save(lot);

        const wip = await this.wip.receiveTransfer(manager, {
          productionOrderId: order.id,
          lineId: line.id,
          stepIndex: next.index,
          processStepId: next.processStepId,
          sourceLotId: lot.id,
          sourceLotNo: lot.lotNo,
          packSize: dto.packSize ?? line.packingQuantity,
          qty: allocation.qty,
          origins,
          receivedAt: now,
        });
        await this.ledger.write(
          manager,
          {
            requestId: dto.requestId,
            productionOrderId: order.id,
            productionOrderLineId: line.id,
            stepIndex,
            processStepId: step.processStepId,
            transactionType: 'TRANSFER',
            sourceLotId: lot.id,
            targetWipId: wip.id,
            qty: allocation.qty,
            transactionDate: day.productionDate,
            shiftKey: day.shift,
            allocationMode: mode,
            remark: dto.remark?.trim() || null,
            operatorId: userId,
          },
          origins,
        );
        audit.push({
          lotNo: lot.lotNo,
          qty: allocation.qty,
          origins: origins.map((o) => ({ lotNo: o.originLotId, qty: o.qty })),
        });
      }

      await recordAuditEvent(manager, {
        traceId: order.code,
        action: 'UPDATE',
        eventName: 'production.lot.transferred',
        targetType: 'PRODUCTION_LOT',
        targetId: allocations.length === 1 ? allocations[0].id : null,
        performedBy: userId,
        requestId: dto.requestId,
        after: {
          productionOrder: order.code,
          from: step.code,
          to: next.code,
          qty: dto.qty,
          allocationMode: mode,
          transferDate: day.productionDate,
          shift: day.shift,
          lots: audit,
        },
      });

      await completeLotOrderIfDone(manager, order.id, userId, dto.requestId);
      return this.result(manager, line.id, step, next, dto.requestId, false);
    });
  }

  private async result(
    manager: EntityManager,
    lineId: string,
    step: WorkflowStepInfo,
    next: WorkflowStepInfo,
    requestId: string,
    replayed: boolean,
  ): Promise<TransferResult> {
    const moves = (await manager.query(
      `SELECT t.id, l.lot_no, t.qty, w.qr_code, t.target_wip_id
       FROM inventory.production_transactions t
       JOIN inventory.production_lots l ON l.id = t.source_lot_id
       LEFT JOIN inventory.process_wip w ON w.id = t.target_wip_id
       WHERE t.request_id = $1 AND t.production_order_line_id = $2
         AND t.transaction_type = 'TRANSFER'
       ORDER BY t.id`,
      [requestId, lineId],
    )) as unknown as Array<{
      id: string;
      lot_no: string;
      qty: number;
      qr_code: string | null;
      target_wip_id: string;
    }>;
    const origins = (await manager.query(
      `SELECT o.transaction_id, ol.lot_no, o.qty
       FROM inventory.production_transaction_origins o
       JOIN inventory.production_lots ol ON ol.id = o.origin_lot_id
       WHERE o.transaction_id = ANY($1::bigint[])
       ORDER BY ol.production_date, ol.id`,
      [moves.map((m) => m.id)],
    )) as unknown as Array<{
      transaction_id: string;
      lot_no: string;
      qty: number;
    }>;
    const boxesByWip = await loadWipBoxes(
      manager,
      moves.map((m) => String(m.target_wip_id)),
    );
    const totals = (await manager.query(
      `SELECT
         (SELECT COALESCE(SUM(remaining_qty), 0) FROM inventory.production_lots
           WHERE production_order_line_id = $1 AND step_index = $2 AND status = 'OPEN')::int AS ready,
         (SELECT COALESCE(SUM(qty_remaining), 0) FROM inventory.process_wip
           WHERE production_order_line_id = $1 AND step_index = $3 AND status = 'OPEN')::int AS waiting`,
      [lineId, step.index, next.index],
    )) as unknown as Array<{ ready: number; waiting: number }>;
    return {
      replayed,
      fromStep: {
        stepIndex: step.index,
        code: step.code,
        readyQty: totals[0].ready,
      },
      toStep: {
        stepIndex: next.index,
        code: next.code,
        waitingQty: totals[0].waiting,
      },
      transfers: moves.map((m) => ({
        lotNo: m.lot_no,
        qty: Number(m.qty),
        qrCode: m.qr_code,
        boxes: boxesByWip.get(String(m.target_wip_id)) ?? [],
        origins: origins
          .filter((o) => String(o.transaction_id) === String(m.id))
          .map((o) => ({ lotNo: o.lot_no, qty: Number(o.qty) })),
      })),
    };
  }
}
