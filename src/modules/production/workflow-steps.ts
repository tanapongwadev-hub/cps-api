import { ConflictException } from '@nestjs/common';
import { MaterialWorkflow } from '../../entities/master/material-engineering.entity';
import { EntityManager } from 'typeorm';
import { ProductWorkflow } from '../../entities/master/product-workflow.entity';
import type { ReceivingType } from './domain/lot-number';

export interface WorkflowStepInfo {
  index: number;
  processStepId: string;
  code: string;
  name: string;
  receivingType: ReceivingType;
}

/** The pinned workflow's steps in order (index = step_index). */
export async function loadWorkflowSteps(
  manager: EntityManager,
  workflowId: string | null,
  materialWorkflowId?: string | null,
): Promise<WorkflowStepInfo[]> {
  const workflow = materialWorkflowId
    ? await manager.getRepository(MaterialWorkflow).findOne({
        where: { id: materialWorkflowId }, relations: ['steps', 'steps.processStep'],
      })
    : workflowId
      ? await manager.getRepository(ProductWorkflow).findOne({
          where: { id: workflowId }, relations: ['steps', 'steps.processStep'],
        })
      : null;
  if (!workflow?.steps.length) {
    throw new ConflictException('ไม่พบขั้นตอนของ Workflow ที่ตรึงไว้ในใบสั่งผลิต');
  }
  return [...(workflow?.steps ?? [])]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((step, index) => ({
      index,
      processStepId: step.processStepId,
      code: step.processStep.code,
      name: step.processStep.nameTh,
      receivingType: step.processStep.receivingType ?? 'NONE',
    }));
}
