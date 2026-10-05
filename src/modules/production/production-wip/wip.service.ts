import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import {
  ProductionOrder,
  ProductionOrderLine,
} from '../../production-orders/production-order.entity';
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
}
