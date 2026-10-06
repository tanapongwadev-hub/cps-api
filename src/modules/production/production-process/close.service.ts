import { ConflictException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { recordAuditEvent } from '../../../common/stock-ledger';
import { ProductionOrderLine } from '../../production-orders/production-order.entity';
import { allocateFifo } from '../domain/allocation';
import { productionDayOf } from '../domain/production-day';
import { ProcessWip } from '../entities/process-wip.entity';
import { LedgerService } from '../production-transaction/ledger.service';
import { WipService } from '../production-wip/wip.service';
import { completeLotOrderIfDone } from './completion';
import { CloseRemainingDto } from './dto/close-remaining.dto';
import { lockLotModelLine, stepAt } from './line-context';
import {
  consumeFromBoxes,
  recordBoxRows,
  type BoxConsumption,
} from './wip-boxes';

export interface CloseRemainingResult {
  replayed: boolean;
  closedQty: number;
  step: { stepIndex: number; code: string; waitingQty: number };
  orderCompleted: boolean;
}

/**
 * "ปิดยอดค้าง" for the LOT model: pieces waiting at a step that will never be
 * produced are closed (WIP qty_closed), oldest first, with their origins on
 * a SHORT_CLOSE ledger row. Counts toward the line's short-closed quantity,
 * and can complete the order. Reversible like produce/transfer.
 */
@Injectable()
export class CloseService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly wip: WipService,
    private readonly ledger: LedgerService,
  ) {}

  async closeRemaining(
    lineId: string,
    stepIndex: number,
    dto: CloseRemainingDto,
    userId: string,
  ): Promise<CloseRemainingResult> {
    return this.dataSource.transaction(async (manager) => {
      const { line, order, steps } = await lockLotModelLine(manager, lineId);
      const step = stepAt(steps, stepIndex);

      const done = await manager.query<Array<{ qty: number }>>(
        `SELECT COALESCE(SUM(qty), 0)::int AS qty FROM inventory.production_transactions
         WHERE request_id = $1 AND production_order_line_id = $2 AND transaction_type = 'SHORT_CLOSE'`,
        [dto.requestId, line.id],
      );
      if (Number(done[0].qty) > 0) {
        return this.result(
          manager,
          line.id,
          step,
          Number(done[0].qty),
          true,
          false,
        );
      }

      const rows = await this.wip.lockOpenRows(manager, line.id, stepIndex);
      const waiting = rows.reduce((sum, r) => sum + r.qtyRemaining, 0);
      const qty = dto.qty ?? waiting;
      if (qty < 1)
        throw new ConflictException('ไม่มีงานรอผลิตที่ขั้นตอนนี้ให้ปิด');
      if (qty > waiting) {
        throw new ConflictException(
          `จำนวนเกินงานรอผลิต (รอผลิตอยู่ ${waiting} ชิ้น)`,
        );
      }
      const originsByWip = await this.wip.lockOrigins(
        manager,
        rows.map((r) => r.id),
      );
      const day = productionDayOf(new Date());
      const reason = dto.reason.trim();
      const wipRepo = manager.getRepository(ProcessWip);

      for (const a of allocateFifo(
        rows.map((r) => ({ id: r.id, remaining: r.qtyRemaining })),
        qty,
      )) {
        const row = rows.find((r) => r.id === a.id)!;
        let boxes: BoxConsumption | null = null;
        let origins;
        if (row.qrCode) {
          boxes = await consumeFromBoxes(manager, row.id, a.qty);
          origins = boxes.origins;
        } else {
          origins = row.sourceLotId
            ? await this.wip.takeOrigins(
                manager,
                originsByWip.get(row.id) ?? [],
                a.qty,
              )
            : [];
        }
        row.qtyClosed += a.qty;
        row.qtyRemaining -= a.qty;
        if (row.qtyRemaining === 0) row.status = 'DONE';
        await wipRepo.save(row);
        const closeTx = await this.ledger.write(
          manager,
          {
            requestId: dto.requestId,
            productionOrderId: order.id,
            productionOrderLineId: line.id,
            stepIndex,
            processStepId: step.processStepId,
            transactionType: 'SHORT_CLOSE',
            sourceWipId: row.id,
            sourceLotId: row.sourceLotId,
            qty: a.qty,
            transactionDate: day.productionDate,
            shiftKey: day.shift,
            remark: reason,
            operatorId: userId,
          },
          origins,
        );
        if (boxes) {
          await recordBoxRows(manager, closeTx.id, row.id, boxes.boxes);
        }
      }

      line.shortClosedQuantity += qty;
      line.shortCloseReason = reason;
      line.shortClosedAt = new Date();
      line.shortClosedBy = userId;
      await manager.getRepository(ProductionOrderLine).save(line);

      await recordAuditEvent(manager, {
        traceId: order.code,
        action: 'UPDATE',
        eventName: 'production_order.remaining_closed',
        targetType: 'PRODUCTION_ORDER',
        targetId: order.id,
        performedBy: userId,
        requestId: dto.requestId,
        after: {
          productionOrder: order.code,
          trackingModel: 'LOT',
          step: step.code,
          closedQty: qty,
          reason,
          shortClosedQuantity: line.shortClosedQuantity,
        },
      });

      const completed = await completeLotOrderIfDone(
        manager,
        order.id,
        userId,
        dto.requestId,
      );
      return this.result(manager, line.id, step, qty, false, completed);
    });
  }

  private async result(
    manager: EntityManager,
    lineId: string,
    step: { index: number; code: string },
    closedQty: number,
    replayed: boolean,
    orderCompleted: boolean,
  ): Promise<CloseRemainingResult> {
    const waiting = await manager.query<Array<{ w: number }>>(
      `SELECT COALESCE(SUM(qty_remaining), 0)::int AS w FROM inventory.process_wip
       WHERE production_order_line_id = $1 AND step_index = $2 AND status = 'OPEN'`,
      [lineId, step.index],
    );
    return {
      replayed,
      closedQty,
      step: {
        stepIndex: step.index,
        code: step.code,
        waitingQty: Number(waiting[0].w),
      },
      orderCompleted,
    };
  }
}
