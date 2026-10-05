import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductWorkflow } from '../../entities/master/product-workflow.entity';
import { Product } from '../../entities/master/product.entity';
import { AccessControlModule } from '../access-control/access-control.module';
import { MaterialJobOrder } from '../material-job-orders/material-job-order.entity';
import { ProductionPlan } from '../production-plans/production-plan.entity';
import {
  ProductionOrder,
  ProductionOrderLine,
  ProductionOrderPacket,
} from './production-order.entity';
import { ProductionOrdersController } from './production-orders.controller';
import { ProductionOrdersService } from './production-orders.service';

@Module({
  imports: [
    AccessControlModule,
    TypeOrmModule.forFeature([
      ProductionOrder,
      ProductionOrderLine,
      ProductionOrderPacket,
      ProductionPlan,
      MaterialJobOrder,
      Product,
      ProductWorkflow,
    ]),
  ],
  controllers: [ProductionOrdersController],
  providers: [ProductionOrdersService],
})
export class ProductionOrdersModule {}
