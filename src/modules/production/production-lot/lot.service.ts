import { Injectable } from '@nestjs/common';
import { EntityManager, IsNull } from 'typeorm';
import {
  ProductionOrder,
  ProductionOrderLine,
} from '../../production-orders/production-order.entity';
import { allocateFifo } from '../domain/allocation';
import { formatLotNo, lotPrefix } from '../domain/lot-number';
import { ProductionDay } from '../domain/production-day';
import {
  LotType,
  ProductionLot,
  ProductionLotOrigin,
  ProductionLotSource,
} from '../entities/production-lot.entity';
import { WorkflowStepInfo } from '../workflow-steps';

export interface OutputBucket {
  order: ProductionOrder;
  line: ProductionOrderLine;
  step: WorkflowStepInfo;
  day: ProductionDay;
  userId: string | null;
}

@Injectable()
export class LotService {
  /** Next lot number for prefix + production day (row-locked counter). */
  async nextLotNo(
    manager: EntityManager,
    prefix: string,
    productionDate: string,
  ): Promise<string> {
    const rows = (await manager.query(
      `INSERT INTO inventory.production_lot_counters (prefix, lot_date, last_seq)
       VALUES ($1, $2, 1)
       ON CONFLICT (prefix, lot_date)
       DO UPDATE SET last_seq = inventory.production_lot_counters.last_seq + 1
       RETURNING last_seq`,
      [prefix, productionDate],
    )) as unknown as Array<{ last_seq: number }>;
    return formatLotNo(prefix, productionDate, Number(rows[0].last_seq));
  }

  /**
   * Adds `qty` of output to the open lot of this line/step/day/shift (locked),
   * creating the lot on the shift's first output. One lot per shift.
   */
  async addOutput(
    manager: EntityManager,
    bucket: OutputBucket,
    lotType: LotType,
    qty: number,
  ): Promise<{ lot: ProductionLot; isNew: boolean }> {
    const repo = manager.getRepository(ProductionLot);
    const existing = await repo.findOne({
      where: {
        productionOrderLineId: bucket.line.id,
        stepIndex: bucket.step.index,
        productionDate: bucket.day.productionDate,
        shiftKey: bucket.day.shift,
        outputClosedAt: IsNull(),
      },
      lock: { mode: 'pessimistic_write' },
    });
    if (existing) {
      existing.producedQty += qty;
      existing.remainingQty += qty;
      existing.status = 'OPEN';
      return { lot: await repo.save(existing), isNew: false };
    }

    const lotNo = await this.nextLotNo(
      manager,
      lotPrefix(bucket.step.code, bucket.step.receivingType),
      bucket.day.productionDate,
    );
    const lot = await repo.save(
      repo.create({
        lotNo,
        productionOrderId: bucket.order.id,
        productionOrderLineId: bucket.line.id,
        productId: bucket.line.productId,
        stepIndex: bucket.step.index,
        processStepId: bucket.step.processStepId,
        processCode: bucket.step.code,
        lotType,
        producedQty: qty,
        remainingQty: qty,
        productionDate: bucket.day.productionDate,
        shiftKey: bucket.day.shift,
        status: 'OPEN',
        createdBy: bucket.userId,
      }),
    );
    return { lot, isNew: true };
  }

  /**
   * First-step output → ORIGIN lot, which is its own origin: the self row in
   * production_lot_origins grows with the lot.
   */
  async addOriginOutput(
    manager: EntityManager,
    bucket: OutputBucket,
    qty: number,
  ): Promise<{ lot: ProductionLot; isNew: boolean }> {
    const result = await this.addOutput(manager, bucket, 'ORIGIN', qty);
    await manager.query(
      `INSERT INTO inventory.production_lot_origins (lot_id, origin_lot_id, qty, qty_remaining)
       VALUES ($1, $1, $2, $2)
       ON CONFLICT (lot_id, origin_lot_id)
       DO UPDATE SET qty = inventory.production_lot_origins.qty + EXCLUDED.qty,
                     qty_remaining = inventory.production_lot_origins.qty_remaining + EXCLUDED.qty`,
      [result.lot.id, qty],
    );
    return result;
  }

  /** Adds origin quantities to a (non-ORIGIN) lot's composition. */
  async addOrigins(
    manager: EntityManager,
    lotId: string,
    origins: Array<{ originLotId: string; qty: number }>,
  ): Promise<void> {
    for (const origin of origins) {
      await manager.query(
        `INSERT INTO inventory.production_lot_origins (lot_id, origin_lot_id, qty, qty_remaining)
         VALUES ($1, $2, $3, $3)
         ON CONFLICT (lot_id, origin_lot_id)
         DO UPDATE SET qty = inventory.production_lot_origins.qty + EXCLUDED.qty,
                       qty_remaining = inventory.production_lot_origins.qty_remaining + EXCLUDED.qty`,
        [lotId, origin.originLotId, origin.qty],
      );
    }
  }

  /** Lineage edge: `qty` of `sourceLotId` went into `targetLotId`. */
  async addSource(
    manager: EntityManager,
    targetLotId: string,
    sourceLotId: string,
    qty: number,
    transactionId: string,
  ): Promise<void> {
    await manager.getRepository(ProductionLotSource).insert({
      targetLotId,
      sourceLotId,
      qty,
      transactionId,
    });
  }

  /**
   * Lots of a step that still hold pieces (produced, not yet transferred),
   * locked, oldest first (production date, id) — the FIFO order for transfer.
   */
  lockReadyLots(
    manager: EntityManager,
    lineId: string,
    stepIndex: number,
  ): Promise<ProductionLot[]> {
    return manager
      .getRepository(ProductionLot)
      .createQueryBuilder('l')
      .setLock('pessimistic_write')
      .where('l.productionOrderLineId = :lineId', { lineId })
      .andWhere('l.stepIndex = :stepIndex', { stepIndex })
      .andWhere('l.remainingQty > 0')
      .andWhere(`l.status = 'OPEN'`)
      .orderBy('l.productionDate', 'ASC')
      .addOrderBy('l.id', 'ASC')
      .getMany();
  }

  /**
   * Takes `qty` out of a lot's origin composition, oldest origin first, and
   * persists the new remaining quantities. Returns what was taken per origin.
   */
  async takeOrigins(
    manager: EntityManager,
    lotId: string,
    qty: number,
  ): Promise<Array<{ originLotId: string; qty: number }>> {
    const rows = (await manager.query(
      `SELECT o.origin_lot_id, o.qty_remaining
       FROM inventory.production_lot_origins o
       JOIN inventory.production_lots ol ON ol.id = o.origin_lot_id
       WHERE o.lot_id = $1 AND o.qty_remaining > 0
       ORDER BY ol.production_date, ol.id
       FOR UPDATE OF o`,
      [lotId],
    )) as unknown as Array<{ origin_lot_id: string; qty_remaining: number }>;
    const taken = allocateFifo(
      rows.map((r) => ({
        id: String(r.origin_lot_id),
        remaining: Number(r.qty_remaining),
      })),
      qty,
    );
    for (const t of taken) {
      await manager.query(
        `UPDATE inventory.production_lot_origins
         SET qty_remaining = qty_remaining - $3
         WHERE lot_id = $1 AND origin_lot_id = $2`,
        [lotId, t.id, t.qty],
      );
    }
    return taken.map((t) => ({ originLotId: t.id, qty: t.qty }));
  }

  originsOf(manager: EntityManager, lotId: string) {
    return manager.getRepository(ProductionLotOrigin).find({
      where: { lotId },
      relations: ['originLot'],
      order: { originLotId: 'ASC' },
    });
  }
}
