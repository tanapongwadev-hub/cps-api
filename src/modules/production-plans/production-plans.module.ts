import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from '../../entities/master/product.entity';
import { AccessControlModule } from '../access-control/access-control.module';
import { MaterialJobOrdersModule } from '../material-job-orders/material-job-orders.module';
import { ProductionPlanLine } from './production-plan-line.entity';
import { ProductionPlanReservation } from './production-plan-reservation.entity';
import { ProductionPlan } from './production-plan.entity';
import { ProductionPlanExpiryJob } from './production-plan-expiry.job';
import { ProductionPlansController } from './production-plans.controller';
import { ProductionPlansService } from './production-plans.service';

@Module({
  imports: [
    AccessControlModule,
    MaterialJobOrdersModule,
    TypeOrmModule.forFeature([
      ProductionPlan,
      ProductionPlanLine,
      ProductionPlanReservation,
      Product,
    ]),
  ],
  controllers: [ProductionPlansController],
  providers: [ProductionPlansService, ProductionPlanExpiryJob],
  exports: [ProductionPlansService],
})
export class ProductionPlansModule {}
