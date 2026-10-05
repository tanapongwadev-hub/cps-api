import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ProductionOrderLine } from '../../production-orders/production-order.entity';
import { loadWorkflowSteps } from '../workflow-steps';

export interface BoardStep {
  stepIndex: number;
  code: string;
  name: string;
  receivingType: string;
  /** Pieces that arrived at the step (plan release or transfers in). */
  inputQty: number;
  /** Pieces produced (good) into this step's lots. */
  producedQty: number;
  /** Arrived, not yet produced (WIP). */
  waitingQty: number;
  /** Produced, not yet transferred (at a receiving step: not yet packed). */
  readyQty: number;
  transferredQty: number;
  rejectedQty: number;
  /** Closed short (not produced). */
  closedQty: number;
  lots: Array<{
    id: string;
    lotNo: string;
    lotType: string;
    producedQty: number;
    remainingQty: number;
    productionDate: string;
    shift: string;
    status: string;
  }>;
}

/** Process Board numbers for one order line (read-only, no locks). */
@Injectable()
export class BoardService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async board(lineId: string) {
    const line = await this.dataSource
      .getRepository(ProductionOrderLine)
      .findOne({ where: { id: lineId }, relations: ['product', 'order'] });
    if (!line) throw new NotFoundException(`ไม่พบรายการสั่งผลิต id ${lineId}`);
    const steps = await loadWorkflowSteps(
      this.dataSource.manager,
      line.workflowId,
    );

    type Agg = Record<string, number | string>;
    const byStep = (rows: Agg[]) =>
      new Map(rows.map((r) => [Number(r.step_index), r]));
    const wip = byStep(
      await this.dataSource.query<Agg[]>(
        // A reversed transfer closes its whole WIP row; it neither arrived
        // nor was closed short, so it is left out of input/closed.
        `SELECT w.step_index,
                COALESCE(SUM(w.qty_in) FILTER (WHERE r.id IS NULL), 0)::int AS input,
                COALESCE(SUM(w.qty_remaining) FILTER (WHERE w.status = 'OPEN'), 0)::int AS waiting,
                SUM(w.qty_rejected)::int AS rejected,
                COALESCE(SUM(w.qty_closed) FILTER (WHERE r.id IS NULL), 0)::int AS closed
         FROM inventory.process_wip w
         LEFT JOIN inventory.production_transactions r
           ON r.target_wip_id = w.id AND r.transaction_type = 'REVERSAL'
         WHERE w.production_order_line_id = $1
         GROUP BY w.step_index`,
        [lineId],
      ),
    );
    const produced = byStep(
      await this.dataSource.query<Agg[]>(
        `SELECT step_index, SUM(produced_qty)::int AS produced,
                COALESCE(SUM(remaining_qty) FILTER (WHERE status = 'OPEN'), 0)::int AS ready
         FROM inventory.production_lots
         WHERE production_order_line_id = $1 AND status <> 'REVERSED'
         GROUP BY step_index`,
        [lineId],
      ),
    );
    const transferred = byStep(
      await this.dataSource.query<Agg[]>(
        `SELECT t.step_index, SUM(t.qty)::int AS transferred
         FROM inventory.production_transactions t
         LEFT JOIN inventory.production_transactions o ON o.id = t.reverses_transaction_id
         WHERE t.production_order_line_id = $1
           AND (t.transaction_type = 'TRANSFER'
                OR (t.transaction_type = 'REVERSAL' AND o.transaction_type = 'TRANSFER'))
         GROUP BY t.step_index`,
        [lineId],
      ),
    );
    const lots = await this.dataSource.query<Agg[]>(
      `SELECT id, lot_no, lot_type, step_index, produced_qty, remaining_qty,
              production_date::text AS production_date, shift_key, status
       FROM inventory.production_lots
       WHERE production_order_line_id = $1
       ORDER BY step_index, production_date, id`,
      [lineId],
    );

    const n = (row: Agg | undefined, key: string) => Number(row?.[key] ?? 0);
    const boardSteps: BoardStep[] = steps.map((step) => ({
      stepIndex: step.index,
      code: step.code,
      name: step.name,
      receivingType: step.receivingType,
      inputQty: n(wip.get(step.index), 'input'),
      producedQty: n(produced.get(step.index), 'produced'),
      waitingQty: n(wip.get(step.index), 'waiting'),
      readyQty: n(produced.get(step.index), 'ready'),
      transferredQty: n(transferred.get(step.index), 'transferred'),
      rejectedQty: n(wip.get(step.index), 'rejected'),
      closedQty: n(wip.get(step.index), 'closed'),
      lots: lots
        .filter((l) => Number(l.step_index) === step.index)
        .map((l) => ({
          id: String(l.id),
          lotNo: String(l.lot_no),
          lotType: String(l.lot_type),
          producedQty: Number(l.produced_qty),
          remainingQty: Number(l.remaining_qty),
          productionDate: String(l.production_date),
          shift: String(l.shift_key),
          status: String(l.status),
        })),
    }));

    return {
      line: {
        id: line.id,
        lineNo: line.lineNo,
        orderId: line.productionOrderId,
        orderCode: line.order?.code ?? null,
        orderStatus: line.order?.status ?? null,
        product: line.product
          ? {
              id: line.product.id,
              code: line.product.code,
              name: line.product.name,
            }
          : null,
        plannedQty: line.quantity,
        producedQty: line.producedQty,
        receivedQty: line.receivedQty,
        rejectedQty: line.rejectedQty,
        shortClosedQty: line.shortClosedQuantity,
      },
      steps: boardSteps,
    };
  }
}
