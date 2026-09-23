import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MaterialReceivingPackage } from '../../entities/inventory/material-receiving-package.entity';
import { StockBalance } from '../../entities/inventory/stock-balance.entity';
import { Material } from '../../entities/master/material.entity';
import { AccessControlModule } from '../access-control/access-control.module';
import { MaterialDisbursementItem } from '../materials-disbursement/material-disbursement-item.entity';
import { MaterialDisbursementPackage } from '../materials-disbursement/material-disbursement-package.entity';
import { MaterialsDisbursement } from '../materials-disbursement/materials-disbursement.entity';
import { ProductionPlan } from '../production-plans/production-plan.entity';
import { ProductionPlanReservation } from '../production-plans/production-plan-reservation.entity';
import { MaterialJobOrder } from './material-job-order.entity';
import { MaterialJobOrdersController } from './material-job-orders.controller';
import { MaterialJobOrdersService } from './material-job-orders.service';

@Module({
  imports: [
    // PermissionGuard (used on MaterialJobOrdersController) resolves
    // EffectivePermissionService from here — every other guarded module in
    // this app imports it for the same reason (see production-plans.module.ts).
    AccessControlModule,
    TypeOrmModule.forFeature([
      MaterialJobOrder,
      ProductionPlan,
      ProductionPlanReservation,
      MaterialReceivingPackage,
      Material,
      StockBalance,
      MaterialsDisbursement,
      MaterialDisbursementItem,
      MaterialDisbursementPackage,
    ]),
  ],
  controllers: [MaterialJobOrdersController],
  providers: [MaterialJobOrdersService],
  exports: [MaterialJobOrdersService],
})
export class MaterialJobOrdersModule {}
