import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In } from 'typeorm';
import { recordAuditEvent } from '../../../common/stock-ledger';
import { ProductionOrderLine } from '../../production-orders/production-order.entity';
import { productionDayOf } from '../domain/production-day';
import { ProcessWip } from '../entities/process-wip.entity';
import {
  ProductionLot,
  ProductionLotSource,
} from '../entities/production-lot.entity';
import {
  ProductionTransaction,
  ProductionTransactionOrigin,
} from '../entities/production-transaction.entity';
import { LedgerService } from '../production-transaction/ledger.service';
import { ReverseDto } from './dto/reverse.dto';
import { lockLotModelLine } from './line-context';

/** Movement types a user can take back (one produce or transfer request). */
const REVERSIBLE = [
  'PROCESS_OUTPUT',
  'FG_RECEIVE',
  'REJECT',
  'TRANSFER',
  'SHORT_CLOSE',
];

export interface ReverseResult {
  replayed: boolean;
  reversedRequestId: string;
  movements: Array<{
    type: string;
    stepIndex: number;
    qty: number;
    lotNo: string | null;
  }>;
}

/**
 * V10 — corrects a mistaken produce or transfer by appending REVERSAL
 * movements (nothing is edited or deleted in the ledger). Allowed only while
 * the pieces have not moved on:
 *  - produce: the target lot still holds every reversed piece, per origin;
 *  - transfer: the WIP row it created at the next step is untouched.
 * State (WIP, lot, origins, lineage, counters) is restored in one transaction
 * under the order-line lock, in the same lock order as produce/transfer.
 */
@Injectable()
export class ReversalService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly ledger: LedgerService,
  ) {}

  async reverse(
    lineId: string,
    targetRequestId: string,
    dto: ReverseDto,
    userId: string,
  ): Promise<ReverseResult> {
    return this.dataSource.transaction(async (manager) => {
      const { line, order } = await lockLotModelLine(manager, lineId);
      const txRepo = manager.getRepository(ProductionTransaction);

      const originals = await txRepo.find({
        where: {
          requestId: targetRequestId,
          productionOrderLineId: line.id,
          transactionType: In(REVERSIBLE),
        },
        order: { id: 'ASC' },
      });
      if (!originals.length) {
        throw new NotFoundException(
          'ไม่พบรายการบันทึกผลิตหรือส่งต่อที่กลับรายการได้',
        );
      }
      const already = await txRepo.find({
        where: {
          reversesTransactionId: In(originals.map((t) => t.id)),
        },
      });
      if (already.length) {
        if (already.every((t) => t.requestId === dto.requestId)) {
          return this.summary(manager, targetRequestId, originals, true);
        }
        throw new ConflictException('รายการนี้ถูกกลับรายการไปแล้ว');
      }

      const originsByTx = await this.originsOf(
        manager,
        originals.map((t) => t.id),
      );

      // Locks in the produce/transfer order: WIP rows, then lots.
      const wipIds = originals.flatMap((t) =>
        [t.sourceWipId, t.targetWipId].filter((id): id is string => !!id),
      );
      const wips = wipIds.length
        ? await manager
            .getRepository(ProcessWip)
            .createQueryBuilder('w')
            .setLock('pessimistic_write')
            .where('w.id IN (:...ids)', { ids: wipIds })
            .orderBy('w.id', 'ASC')
            .getMany()
        : [];
      const lotIds = [
        ...new Set(
          originals.flatMap((t) =>
            t.transactionType === 'TRANSFER'
              ? [t.sourceLotId]
              : [t.targetLotId],
          ),
        ),
      ].filter((id): id is string => !!id);
      const lots = lotIds.length
        ? await manager
            .getRepository(ProductionLot)
            .createQueryBuilder('l')
            .setLock('pessimistic_write')
            .where('l.id IN (:...ids)', { ids: lotIds })
            .orderBy('l.id', 'ASC')
            .getMany()
        : [];
      const wipOf = (id: string | null) => wips.find((w) => w.id === id)!;
      const lotOf = (id: string | null) => lots.find((l) => l.id === id)!;

      await this.assertReversible(
        manager,
        originals,
        originsByTx,
        wipOf,
        lotOf,
      );

      const day = productionDayOf(new Date());
      const counters = { produced: 0, received: 0, rejected: 0, closed: 0 };
      for (const tx of originals) {
        const origins = originsByTx.get(tx.id) ?? [];
        if (tx.transactionType === 'TRANSFER') {
          await this.undoTransfer(manager, tx, origins, wipOf, lotOf);
        } else if (tx.transactionType === 'SHORT_CLOSE') {
          // Closed pieces wait at the step again, with their origins.
          const wip = wipOf(tx.sourceWipId);
          wip.qtyClosed -= tx.qty;
          wip.qtyRemaining += tx.qty;
          wip.status = 'OPEN';
          if (wip.sourceLotId) {
            for (const o of origins) {
              await manager.query(
                `UPDATE inventory.process_wip_origins SET qty_remaining = qty_remaining + $3
                 WHERE wip_id = $1 AND origin_lot_id = $2`,
                [wip.id, o.originLotId, o.qty],
              );
            }
          }
          counters.closed += tx.qty;
        } else {
          await this.undoProduce(manager, tx, origins, wipOf, lotOf);
          const lot = tx.targetLotId ? lotOf(tx.targetLotId) : null;
          if (tx.transactionType === 'REJECT') counters.rejected += tx.qty;
          else if (tx.transactionType === 'FG_RECEIVE')
            counters.received += tx.qty;
          else if (lot?.lotType === 'ORIGIN') counters.produced += tx.qty;
        }
        const reversal = await this.ledger.write(
          manager,
          {
            requestId: dto.requestId,
            productionOrderId: order.id,
            productionOrderLineId: line.id,
            stepIndex: tx.stepIndex,
            processStepId: tx.processStepId,
            transactionType: 'REVERSAL',
            sourceLotId: tx.sourceLotId,
            targetLotId: tx.targetLotId,
            sourceWipId: tx.sourceWipId,
            targetWipId: tx.targetWipId,
            rejectReasonId: tx.rejectReasonId,
            qty: -tx.qty,
            transactionDate: day.productionDate,
            shiftKey: day.shift,
            reversesTransactionId: tx.id,
            remark: dto.reason.trim(),
            operatorId: userId,
          },
          origins.map((o) => ({ originLotId: o.originLotId, qty: -o.qty })),
        );
        if (
          tx.transactionType !== 'TRANSFER' &&
          tx.transactionType !== 'REJECT' &&
          tx.sourceLotId &&
          tx.targetLotId
        ) {
          // Lineage is append-only: a negative edge nets the original out.
          await manager.getRepository(ProductionLotSource).insert({
            targetLotId: tx.targetLotId,
            sourceLotId: tx.sourceLotId,
            qty: -tx.qty,
            transactionId: reversal.id,
          });
        }
      }

      for (const lot of lots) {
        lot.status =
          lot.producedQty === 0
            ? 'REVERSED'
            : lot.remainingQty === 0
              ? 'CONSUMED'
              : 'OPEN';
        if (lot.status === 'REVERSED' && !lot.outputClosedAt) {
          // Frees the shift bucket: later output starts a new lot number.
          lot.outputClosedAt = new Date();
        }
      }
      await manager.getRepository(ProductionLot).save(lots);
      await manager.getRepository(ProcessWip).save(wips);

      line.producedQty -= counters.produced;
      line.receivedQty -= counters.received;
      line.rejectedQty -= counters.rejected;
      line.shortClosedQuantity -= counters.closed;
      await manager.getRepository(ProductionOrderLine).save(line);

      await recordAuditEvent(manager, {
        traceId: order.code,
        action: 'UPDATE',
        eventName: 'production.lot.reversed',
        targetType: 'PRODUCTION_LOT',
        targetId: lots.length === 1 ? lots[0].id : null,
        performedBy: userId,
        requestId: dto.requestId,
        after: {
          productionOrder: order.code,
          reversedRequestId: targetRequestId,
          reason: dto.reason.trim(),
          movements: originals.map((t) => ({
            type: t.transactionType,
            stepIndex: t.stepIndex,
            qty: t.qty,
          })),
        },
      });

      return this.summary(manager, targetRequestId, originals, false);
    });
  }

  private async originsOf(manager: EntityManager, txIds: string[]) {
    const rows = await manager
      .getRepository(ProductionTransactionOrigin)
      .find({ where: { transactionId: In(txIds) } });
    const byTx = new Map<string, Array<{ originLotId: string; qty: number }>>();
    for (const r of rows) {
      const list = byTx.get(r.transactionId) ?? [];
      list.push({ originLotId: r.originLotId, qty: r.qty });
      byTx.set(r.transactionId, list);
    }
    return byTx;
  }

  /** Every check runs before anything is written. */
  private async assertReversible(
    manager: EntityManager,
    originals: ProductionTransaction[],
    originsByTx: Map<string, Array<{ originLotId: string; qty: number }>>,
    wipOf: (id: string | null) => ProcessWip,
    lotOf: (id: string | null) => ProductionLot,
  ): Promise<void> {
    // Produce: per target lot, the reversed pieces (per origin) must still be
    // in the lot — not transferred on or packed.
    const need = new Map<string, Map<string, number>>();
    for (const tx of originals) {
      if (tx.transactionType === 'TRANSFER') {
        const wip = wipOf(tx.targetWipId);
        if (
          wip.qtyUsed > 0 ||
          wip.qtyRejected > 0 ||
          wip.qtyClosed > 0 ||
          wip.qtyRemaining !== wip.qtyIn
        ) {
          throw new ConflictException(
            'กลับรายการส่งต่อไม่ได้ เพราะขั้นถัดไปเริ่มผลิตจากชิ้นงานชุดนี้แล้ว',
          );
        }
        continue;
      }
      if (!tx.targetLotId) continue; // REJECT / SHORT_CLOSE: nothing went on
      const perOrigin = need.get(tx.targetLotId) ?? new Map<string, number>();
      for (const o of originsByTx.get(tx.id) ?? []) {
        perOrigin.set(
          o.originLotId,
          (perOrigin.get(o.originLotId) ?? 0) + o.qty,
        );
      }
      need.set(tx.targetLotId, perOrigin);
    }
    for (const [lotId, perOrigin] of need) {
      const lot = lotOf(lotId);
      const total = [...perOrigin.values()].reduce((a, b) => a + b, 0);
      const rows = (await manager.query(
        `SELECT origin_lot_id, qty_remaining FROM inventory.production_lot_origins
         WHERE lot_id = $1 FOR UPDATE`,
        [lotId],
      )) as unknown as Array<{ origin_lot_id: string; qty_remaining: number }>;
      const left = new Map(
        rows.map((r) => [String(r.origin_lot_id), Number(r.qty_remaining)]),
      );
      const short =
        lot.remainingQty < total ||
        [...perOrigin].some(([id, q]) => (left.get(id) ?? 0) < q);
      if (short) {
        throw new ConflictException(
          `กลับรายการไม่ได้ เพราะชิ้นงานใน Lot ${lot.lotNo} ถูกส่งต่อหรือแพ็กไปแล้ว`,
        );
      }
    }
  }

  private async undoProduce(
    manager: EntityManager,
    tx: ProductionTransaction,
    origins: Array<{ originLotId: string; qty: number }>,
    wipOf: (id: string | null) => ProcessWip,
    lotOf: (id: string | null) => ProductionLot,
  ): Promise<void> {
    const wip = wipOf(tx.sourceWipId);
    if (tx.transactionType === 'REJECT') wip.qtyRejected -= tx.qty;
    else wip.qtyUsed -= tx.qty;
    wip.qtyRemaining += tx.qty;
    wip.status = 'OPEN';

    // Pieces go back into the WIP row's origin pool (WIP from a transfer).
    // First-step output (and its rejects) came from the plan: no WIP origins.
    if (wip.sourceLotId) {
      for (const o of origins) {
        await manager.query(
          `UPDATE inventory.process_wip_origins SET qty_remaining = qty_remaining + $3
           WHERE wip_id = $1 AND origin_lot_id = $2`,
          [wip.id, o.originLotId, o.qty],
        );
      }
    }
    if (!tx.targetLotId) return;
    const lot = lotOf(tx.targetLotId);
    lot.producedQty -= tx.qty;
    lot.remainingQty -= tx.qty;
    for (const o of origins) {
      await manager.query(
        `UPDATE inventory.production_lot_origins
         SET qty = qty - $3, qty_remaining = qty_remaining - $3
         WHERE lot_id = $1 AND origin_lot_id = $2`,
        [lot.id, o.originLotId, o.qty],
      );
    }
  }

  private async undoTransfer(
    manager: EntityManager,
    tx: ProductionTransaction,
    origins: Array<{ originLotId: string; qty: number }>,
    wipOf: (id: string | null) => ProcessWip,
    lotOf: (id: string | null) => ProductionLot,
  ): Promise<void> {
    const wip = wipOf(tx.targetWipId);
    wip.qtyClosed += wip.qtyRemaining;
    wip.qtyRemaining = 0;
    wip.status = 'DONE';
    await manager.query(
      `UPDATE inventory.process_wip_origins SET qty_remaining = 0 WHERE wip_id = $1`,
      [wip.id],
    );
    const lot = lotOf(tx.sourceLotId);
    lot.remainingQty += tx.qty;
    for (const o of origins) {
      await manager.query(
        `UPDATE inventory.production_lot_origins SET qty_remaining = qty_remaining + $3
         WHERE lot_id = $1 AND origin_lot_id = $2`,
        [lot.id, o.originLotId, o.qty],
      );
    }
  }

  private async summary(
    manager: EntityManager,
    requestId: string,
    txs: ProductionTransaction[],
    replayed: boolean,
  ): Promise<ReverseResult> {
    const lotIds = [
      ...new Set(
        txs
          .map((t) =>
            t.transactionType === 'TRANSFER' ? t.sourceLotId : t.targetLotId,
          )
          .filter((id): id is string => !!id),
      ),
    ];
    const lots = lotIds.length
      ? await manager
          .getRepository(ProductionLot)
          .find({ where: { id: In(lotIds) } })
      : [];
    return {
      replayed,
      reversedRequestId: requestId,
      movements: txs.map((t) => {
        const lotId =
          t.transactionType === 'TRANSFER' ? t.sourceLotId : t.targetLotId;
        return {
          type: t.transactionType,
          stepIndex: t.stepIndex,
          qty: Math.abs(t.qty),
          lotNo: lots.find((l) => l.id === lotId)?.lotNo ?? null,
        };
      }),
    };
  }
}
