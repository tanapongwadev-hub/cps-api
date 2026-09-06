import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  ProductWorkflow,
  ProductWorkflowStep,
  ProductWorkflowStatus,
} from '../../entities/master/product-workflow.entity';
import { ProcessStep } from '../../entities/master/process-step.entity';
import { CreateProductWorkflowDto } from './dto/create-product-workflow.dto';
import {
  UpdateProductWorkflowDto,
  AddProductWorkflowStepDto,
} from './dto/update-product-workflow.dto';

export type ProductWorkflowWithSteps = Omit<
  ProductWorkflow,
  'steps' | 'product'
> & {
  steps: Array<{
    id: string;
    sortOrder: number;
    processStepId: string;
    processStepCode: string;
    stepName: string;
    description: string | null;
  }>;
};

@Injectable()
export class ProductWorkflowsService {
  private readonly logger = new Logger(ProductWorkflowsService.name);

  constructor(
    @InjectRepository(ProductWorkflow)
    private workflowRepository: Repository<ProductWorkflow>,
    @InjectRepository(ProcessStep)
    private processStepRepository: Repository<ProcessStep>,
    private dataSource?: DataSource,
  ) {}

  private getDataSource(): DataSource {
    return this.dataSource!;
  }

  private buildResponse(workflow: ProductWorkflow): ProductWorkflowWithSteps {
    const steps = (workflow.steps ?? [])
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((step) => ({
        id: step.id,
        sortOrder: step.sortOrder,
        processStepId: step.processStepId,
        processStepCode: (step as any).processStep?.code ?? '',
        stepName: (step as any).processStep?.nameTh ?? '',
        description: step.description,
      }));

    return {
      id: workflow.id,
      productId: workflow.productId,
      version: workflow.version,
      status: workflow.status,
      remark: workflow.remark,
      createdBy: workflow.createdBy,
      updatedBy: workflow.updatedBy,
      createdAt: workflow.createdAt,
      updatedAt: workflow.updatedAt,
      steps,
    };
  }

  /**
   * Reload inside the same transaction as the write — using the outer
   * repository from inside a transaction can hit a connection that has not
   * yet observed the in-flight write (same pitfall documented in
   * BomsService).
   */
  private async reloadInsideTransaction(
    manager: import('typeorm').EntityManager,
    id: string,
  ): Promise<ProductWorkflowWithSteps> {
    const workflow = await manager.getRepository(ProductWorkflow).findOne({
      where: { id },
      relations: ['steps', 'steps.processStep'],
    });
    if (!workflow) {
      throw new NotFoundException(
        `ProductWorkflow with id ${id} not found after write`,
      );
    }
    return this.buildResponse(workflow);
  }

  private async assertProcessStepsExist(
    manager: import('typeorm').EntityManager,
    processStepIds: string[],
  ): Promise<void> {
    const uniqueIds = [...new Set(processStepIds)];
    const processStepRepo = manager.getRepository(ProcessStep);
    const found = await processStepRepo.findByIds(uniqueIds);
    if (found.length !== uniqueIds.length) {
      throw new ConflictException('One or more process step IDs are invalid');
    }
  }

  async findByProduct(productId: string): Promise<ProductWorkflowWithSteps[]> {
    const workflows = await this.workflowRepository.find({
      where: { productId },
      relations: ['steps', 'steps.processStep'],
      order: { createdAt: 'DESC' },
    });
    return workflows.map((workflow) => this.buildResponse(workflow));
  }

  async findOne(id: string): Promise<ProductWorkflowWithSteps> {
    const workflow = await this.workflowRepository.findOne({
      where: { id },
      relations: ['steps', 'steps.processStep'],
    });
    if (!workflow)
      throw new NotFoundException(`ProductWorkflow with id ${id} not found`);
    return this.buildResponse(workflow);
  }

  async create(
    dto: CreateProductWorkflowDto,
    userId: string,
  ): Promise<ProductWorkflowWithSteps> {
    return this.getDataSource().transaction(async (manager) => {
      const workflowRepo = manager.getRepository(ProductWorkflow);

      await this.assertProcessStepsExist(
        manager,
        dto.steps.map((step) => step.processStepId),
      );

      const existingForProduct = await workflowRepo.find({
        where: { productId: dto.productId },
        order: { createdAt: 'DESC' },
      });

      const latestVersion =
        existingForProduct.length > 0 ? existingForProduct[0].version : 'v0';
      const nextVersionNum = parseInt(latestVersion.replace(/^v/, ''), 10) + 1;
      const version = `v${nextVersionNum}`;

      const workflow = workflowRepo.create({
        productId: dto.productId,
        version,
        status: ProductWorkflowStatus.DRAFT,
        remark: dto.remark ?? null,
        createdBy: userId,
        steps: dto.steps.map((step, idx) => ({
          sortOrder: idx + 1,
          processStepId: step.processStepId,
          description: step.description ?? null,
          createdBy: userId,
        })),
      });

      const saved = await workflowRepo.save(workflow);
      return this.reloadInsideTransaction(manager, saved.id);
    });
  }

  async update(
    id: string,
    dto: UpdateProductWorkflowDto,
    userId: string,
  ): Promise<ProductWorkflowWithSteps> {
    return this.getDataSource().transaction(async (manager) => {
      const workflowRepo = manager.getRepository(ProductWorkflow);
      const workflow = await workflowRepo.findOne({ where: { id } });
      if (!workflow)
        throw new NotFoundException(`ProductWorkflow with id ${id} not found`);
      if (workflow.status === ProductWorkflowStatus.ACTIVE) {
        throw new BadRequestException(
          'Cannot update an ACTIVE workflow. Deactivate it first.',
        );
      }

      if (dto.remark !== undefined) workflow.remark = dto.remark;
      workflow.updatedBy = userId;

      await workflowRepo.save(workflow);
      return this.reloadInsideTransaction(manager, id);
    });
  }

  async addStep(
    workflowId: string,
    dto: AddProductWorkflowStepDto,
    userId: string,
  ): Promise<ProductWorkflowWithSteps> {
    return this.getDataSource().transaction(async (manager) => {
      const workflowRepo = manager.getRepository(ProductWorkflow);
      const workflow = await workflowRepo.findOne({
        where: { id: workflowId },
        relations: ['steps'],
      });
      if (!workflow) {
        throw new NotFoundException(
          `ProductWorkflow with id ${workflowId} not found`,
        );
      }
      if (workflow.status === ProductWorkflowStatus.ACTIVE) {
        throw new BadRequestException(
          'Cannot add a step to an ACTIVE workflow',
        );
      }

      await this.assertProcessStepsExist(manager, [dto.processStepId]);

      const stepRepo = manager.getRepository(ProductWorkflowStep);
      const maxSort = workflow.steps?.length
        ? Math.max(...workflow.steps.map((s) => s.sortOrder))
        : 0;

      const newStep = stepRepo.create({
        workflowId,
        sortOrder: maxSort + 1,
        processStepId: dto.processStepId,
        description: dto.description ?? null,
        createdBy: userId,
      });

      await stepRepo.save(newStep);
      return this.reloadInsideTransaction(manager, workflowId);
    });
  }

  async removeStep(
    workflowId: string,
    stepId: string,
    userId: string,
  ): Promise<ProductWorkflowWithSteps> {
    return this.getDataSource().transaction(async (manager) => {
      const workflowRepo = manager.getRepository(ProductWorkflow);
      const stepRepo = manager.getRepository(ProductWorkflowStep);

      const workflow = await workflowRepo.findOne({
        where: { id: workflowId },
      });
      if (!workflow) {
        throw new NotFoundException(
          `ProductWorkflow with id ${workflowId} not found`,
        );
      }
      if (workflow.status === ProductWorkflowStatus.ACTIVE) {
        throw new BadRequestException(
          'Cannot remove a step from an ACTIVE workflow',
        );
      }

      const step = await stepRepo.findOne({
        where: { id: stepId, workflowId },
      });
      if (!step) {
        throw new NotFoundException(
          `Step ${stepId} not found in workflow ${workflowId}`,
        );
      }

      await stepRepo.remove(step);
      return this.reloadInsideTransaction(manager, workflowId);
    });
  }

  async activate(
    id: string,
    userId: string,
  ): Promise<ProductWorkflowWithSteps> {
    return this.getDataSource().transaction(async (manager) => {
      const workflowRepo = manager.getRepository(ProductWorkflow);
      const workflow = await workflowRepo.findOne({ where: { id } });
      if (!workflow)
        throw new NotFoundException(`ProductWorkflow with id ${id} not found`);

      // Only one ACTIVE workflow per product at a time — same rule as BOMs.
      await workflowRepo.update(
        { productId: workflow.productId, status: ProductWorkflowStatus.ACTIVE },
        { status: ProductWorkflowStatus.INACTIVE, updatedBy: userId },
      );

      workflow.status = ProductWorkflowStatus.ACTIVE;
      workflow.updatedBy = userId;
      await workflowRepo.save(workflow);

      return this.reloadInsideTransaction(manager, id);
    });
  }

  async deactivate(
    id: string,
    userId: string,
  ): Promise<ProductWorkflowWithSteps> {
    return this.getDataSource().transaction(async (manager) => {
      const workflowRepo = manager.getRepository(ProductWorkflow);
      const workflow = await workflowRepo.findOne({ where: { id } });
      if (!workflow)
        throw new NotFoundException(`ProductWorkflow with id ${id} not found`);

      workflow.status = ProductWorkflowStatus.INACTIVE;
      workflow.updatedBy = userId;
      await workflowRepo.save(workflow);

      return this.reloadInsideTransaction(manager, id);
    });
  }

  async delete(id: string): Promise<void> {
    const workflow = await this.workflowRepository.findOne({ where: { id } });
    if (!workflow)
      throw new NotFoundException(`ProductWorkflow with id ${id} not found`);
    if (workflow.status === ProductWorkflowStatus.ACTIVE) {
      throw new BadRequestException(
        'Cannot delete an ACTIVE workflow. Deactivate it first.',
      );
    }
    await this.workflowRepository.remove(workflow);
  }
}
