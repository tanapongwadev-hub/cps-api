import { EntityManager } from 'typeorm';
import { recordAuditEvent } from '../../../common/stock-ledger';
import { ProductionOrder } from '../../production-orders/production-order.entity';

/**
 * LOT model: an order is complete when, on every line, nothing is left
 * anywhere in the flow — no WIP waiting at any step, no pieces left in any
 * lot (intermediate lots all sent on, FG/STORE lots all packed) — and the
 * plan quantity is fully accounted for as received + rejected + closed short.
 * Called at the end of every movement, inside its transaction, with the
 * order line still locked. Returns true when the order just completed.
 */
export async function completeLotOrderIfDone(
  manager: EntityManager,
  orderId: string,
  userId: string | null,
  requestId: string,
): Promise<boolean> {
  const lines = await manager.query<
    Array<{
      quantity: number;
      received: number;
      rejected: number;
      closed: number;
      wip_left: number;
      lot_left: number;
    }>
  >(
    `SELECT l.quantity, l.received_qty AS received, l.rejected_qty AS rejected,
            l.short_closed_quantity AS closed,
            (SELECT COALESCE(SUM(w.qty_remaining), 0) FROM inventory.process_wip w
              WHERE w.production_order_line_id = l.id AND w.status = 'OPEN')::int AS wip_left,
            (SELECT COALESCE(SUM(t.remaining_qty), 0) FROM inventory.production_lots t
              WHERE t.production_order_line_id = l.id)::int AS lot_left
     FROM inventory.production_order_lines l
     WHERE l.production_order_id = $1`,
    [orderId],
  );
  const done =
    lines.length > 0 &&
    lines.every(
      (l) =>
        Number(l.wip_left) === 0 &&
        Number(l.lot_left) === 0 &&
        Number(l.received) + Number(l.rejected) + Number(l.closed) ===
          Number(l.quantity),
    );
  if (!done) return false;

  const repo = manager.getRepository(ProductionOrder);
  const order = await repo.findOneOrFail({ where: { id: orderId } });
  if (order.status === 'COMPLETED') return false;
  order.status = 'COMPLETED';
  order.completedAt = new Date();
  await repo.save(order);
  await recordAuditEvent(manager, {
    traceId: order.code,
    action: 'UPDATE',
    eventName: 'production_order.completed',
    targetType: 'PRODUCTION_ORDER',
    targetId: order.id,
    performedBy: userId,
    requestId,
    after: {
      productionOrder: order.code,
      trackingModel: 'LOT',
      lines: lines.map((l) => ({
        quantity: Number(l.quantity),
        received: Number(l.received),
        rejected: Number(l.rejected),
        closed: Number(l.closed),
      })),
    },
  });
  return true;
}
