import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Department } from '../../entities/iam/department.entity';
import { User } from '../../entities/iam/user.entity';
import { MaterialReceivingPackage } from '../../entities/inventory/material-receiving-package.entity';
import { MaterialReceiving } from '../../entities/inventory/material-receiving.entity';
import { StockBalance } from '../../entities/inventory/stock-balance.entity';
import { StockTransaction } from '../../entities/inventory/stock-transaction.entity';
import { Material } from '../../entities/master/material.entity';
import { Supplier } from '../../entities/master/supplier.entity';
import { Unit } from '../../entities/master/unit.entity';
import { AccessControlModule } from '../access-control/access-control.module';
import { MaterialDisbursementItem } from '../materials-disbursement/material-disbursement-item.entity';
import { MaterialDisbursementPackage } from '../materials-disbursement/material-disbursement-package.entity';
import { MaterialsDisbursement } from '../materials-disbursement/materials-disbursement.entity';
import { MaterialTraceabilityController } from './material-traceability.controller';
import { MaterialTraceabilityService } from './material-traceability.service';

@Module({
  imports: [
    AccessControlModule,
    TypeOrmModule.forFeature([
      StockTransaction,
      StockBalance,
      MaterialReceiving,
      MaterialReceivingPackage,
      MaterialsDisbursement,
      MaterialDisbursementItem,
      MaterialDisbursementPackage,
      Material,
      Supplier,
      Unit,
      Department,
      User,
    ]),
  ],
  controllers: [MaterialTraceabilityController],
  providers: [MaterialTraceabilityService],
  exports: [MaterialTraceabilityService],
})
export class MaterialTraceabilityModule {}
