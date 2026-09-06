import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  ProductWorkflow,
  ProductWorkflowStep,
} from '../../entities/master/product-workflow.entity';
import { ProcessStep } from '../../entities/master/process-step.entity';
import { AccessControlModule } from '../access-control/access-control.module';
import { ProductWorkflowsController } from './product-workflows.controller';
import { ProductWorkflowsService } from './product-workflows.service';

@Module({
  imports: [
    AccessControlModule,
    TypeOrmModule.forFeature([
      ProductWorkflow,
      ProductWorkflowStep,
      ProcessStep,
    ]),
  ],
  controllers: [ProductWorkflowsController],
  providers: [ProductWorkflowsService],
  exports: [ProductWorkflowsService],
})
export class ProductWorkflowsModule {}
