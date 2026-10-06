import { ConflictException, NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import {
  ProductionOrder,
  ProductionOrderLine,
} from '../../production-orders/production-order.entity';
import { loadWorkflowSteps, WorkflowStepInfo } from '../workflow-steps';

export interface LineContext {
  line: ProductionOrderLine;
  order: ProductionOrder;
  steps: WorkflowStepInfo[];
}

/**
 * Locks an order line for a lot-model movement and checks it may move.
 * Every produce/transfer of a line queues on this row lock, so concurrent
 * users can never draw the same WIP or lot quantity twice.
 */
export async function lockLotModelLine(
  manager: EntityManager,
  lineId: string,
  allowCompleted = false,
): Promise<LineContext> {
  const line = await manager.getRepository(ProductionOrderLine).findOne({
    where: { id: lineId },
    lock: { mode: 'pessimistic_write' },
  });
  if (!line) throw new NotFoundException(`ไม่พบรายการสั่งผลิต id ${lineId}`);
  const order = await manager
    .getRepository(ProductionOrder)
    .findOneOrFail({ where: { id: line.productionOrderId } });
  if (order.trackingModel !== 'LOT') {
    throw new ConflictException(
      'ใบสั่งผลิตนี้ใช้ระบบกล่องแบบเดิม บันทึกแบบ Lot ไม่ได้',
    );
  }
  if (order.status === 'COMPLETED' && !allowCompleted) {
    throw new ConflictException('ใบสั่งผลิตนี้เสร็จสิ้นแล้ว');
  }
  const steps = await loadWorkflowSteps(manager, line.workflowId);
  return { line, order, steps };
}

export function stepAt(steps: WorkflowStepInfo[], stepIndex: number) {
  const step = steps[stepIndex];
  if (!step) throw new NotFoundException(`ไม่พบขั้นตอนที่ ${stepIndex + 1}`);
  return step;
}
