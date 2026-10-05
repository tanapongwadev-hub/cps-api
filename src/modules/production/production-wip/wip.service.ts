import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import {
  ProductionOrder,
  ProductionOrderLine,
} from '../../production-orders/production-order.entity';
import { allocateFifo } from '../domain/allocation';
import { productionDayOf } from '../domain/production-day';
import { ProcessWip } from '../entities/process-wip.entity';
import { LedgerService } from '../production-transaction/ledger.service';

@Injectable()
export class WipService {
  constructor(private readonly ledger: LedgerService) {}

  /**
   * LOT model: the line's whole plan quantity becomes WIP waiting at the
   * first workflow step (no source lot — it comes from the plan).
   */
  async releasePlan(
    manager: EntityManager,
    order: ProductionOrder,
    line: ProductionOrderLine,
    firstStepProcessId: string,
    userId: string | null,
    now = new Date(),
  ): Promise<ProcessWip> {
    const repo = manager.getRepository(ProcessWip);
    const wip = await repo.save(
      repo.create({
        productionOrderId: order.id,
        productionOrderLineId: line.id,
        stepIndex: 0,
        processStepId: firstStepProcessId,
        sourceLotId: null,
        qtyIn: line.quantity,
        qtyRemaining: line.quantity,
        receivedAt: now,
        status: 'OPEN',
      }),
    );
    const day = productionDayOf(now);
    await this.ledger.write(manager, {
      requestId: randomUUID(),
      productionOrderId: order.id,
      productionOrderLineId: line.id,
      stepIndex: 0,
      processStepId: firstStepProcessId,
      transactionType: 'PLAN_RELEASE',
      targetWipId: wip.id,
      qty: line.quantity,
      transactionDate: day.productionDate,
      shiftKey: day.shift,
      operatorId: userId,
    });
    return wip;
  }

  /** Open WIP rows of a step, locked, in FIFO order (received_at, id). */
  lockOpenRows(
    manager: EntityManager,
    lineId: string,
    stepIndex: number,
  ): Promise<ProcessWip[]> {
    return manager
      .getRepository(ProcessWip)
      .createQueryBuilder('w')
      .setLock('pessimistic_write')
      .where('w.productionOrderLineId = :lineId', { lineId })
      .andWhere('w.stepIndex = :stepIndex', { stepIndex })
      .andWhere(`w.status = 'OPEN'`)
      .orderBy('w.receivedAt', 'ASC')
      .addOrderBy('w.id', 'ASC')
      .getMany();
  }

  /** Consume `qty` from a locked row as produced output. */
  consumeForOutput(row: ProcessWip, qty: number): void {
    row.qtyUsed += qty;
    row.qtyRemaining -= qty;
    if (row.qtyRemaining === 0) row.status = 'DONE';
  }

  /** Consume `qty` from a locked row as scrap (reject). */
  consumeForReject(row: ProcessWip, qty: number): void {
    row.qtyRejected += qty;
    row.qtyRemaining -= qty;
    if (row.qtyRemaining === 0) row.status = 'DONE';
  }

  /**
   * Origin rows of the given WIP rows (locked), grouped per WIP row, each
   * group oldest origin first (origin lot production date, id) — the order
   * in which a mixed WIP row gives up its origins.
   */
  async lockOrigins(
    manager: EntityManager,
    wipIds: string[],
  ): Promise<Map<string, WipOriginRow[]>> {
    const byWip = new Map<string, WipOriginRow[]>();
    if (!wipIds.length) return byWip;
    const rows = (await manager.query(
      `SELECT o.wip_id, o.origin_lot_id, o.qty_remaining
       FROM inventory.process_wip_origins o
       JOIN inventory.production_lots l ON l.id = o.origin_lot_id
       WHERE o.wip_id = ANY($1::bigint[]) AND o.qty_remaining > 0
       ORDER BY o.wip_id, l.production_date, l.id
       FOR UPDATE OF o`,
      [wipIds],
    )) as unknown as Array<{
      wip_id: string;
      origin_lot_id: string;
      qty_remaining: number;
    }>;
    for (const r of rows) {
      const list = byWip.get(String(r.wip_id)) ?? [];
      list.push({
        wipId: String(r.wip_id),
        originLotId: String(r.origin_lot_id),
        qtyRemaining: Number(r.qty_remaining),
      });
      byWip.set(String(r.wip_id), list);
    }
    return byWip;
  }

  /**
   * Takes `qty` from a WIP row's origins (oldest first) and persists the new
   * remaining quantities. Returns what was taken per origin.
   */
  async takeOrigins(
    manager: EntityManager,
    origins: WipOriginRow[],
    qty: number,
  ): Promise<Array<{ originLotId: string; qty: number }>> {
    const taken = allocateFifo(
      origins.map((o) => ({ id: o.originLotId, remaining: o.qtyRemaining })),
      qty,
    );
    for (const t of taken) {
      const row = origins.find((o) => o.originLotId === t.id)!;
      row.qtyRemaining -= t.qty;
      await manager.query(
        `UPDATE inventory.process_wip_origins SET qty_remaining = $3
         WHERE wip_id = $1 AND origin_lot_id = $2`,
        [row.wipId, row.originLotId, row.qtyRemaining],
      );
    }
    return taken.map((t) => ({ originLotId: t.id, qty: t.qty }));
  }
}

export interface WipOriginRow {
  wipId: string;
  originLotId: string;
  qtyRemaining: number;
}
