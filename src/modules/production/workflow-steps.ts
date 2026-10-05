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
  workflowId: string,
): Promise<WorkflowStepInfo[]> {
  const workflow = await manager.getRepository(ProductWorkflow).findOne({
    where: { id: workflowId },
    relations: ['steps', 'steps.processStep'],
  });
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
