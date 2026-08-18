import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MaterialReceivingPackage } from '../../entities/inventory/material-receiving-package.entity';
import { MaterialReceiving } from '../../entities/inventory/material-receiving.entity';
import { MaterialsDisbursementCounter } from '../../entities/inventory/materials-disbursement-counter.entity';
import { StockBalance } from '../../entities/inventory/stock-balance.entity';
import { StockTransaction } from '../../entities/inventory/stock-transaction.entity';
import { Material } from '../../entities/master/material.entity';
import { Unit } from '../../entities/master/unit.entity';
import { AccessControlModule } from '../access-control/access-control.module';
import { MaterialsDisbursementController } from './materials-disbursement.controller';
import { MaterialDisbursementItem } from './material-disbursement-item.entity';
import { MaterialDisbursementPackage } from './material-disbursement-package.entity';
import { MaterialsDisbursement } from './materials-disbursement.entity';
import { MaterialsDisbursementService } from './materials-disbursement.service';

@Module({
  imports: [
    AccessControlModule,
    TypeOrmModule.forFeature([
      MaterialsDisbursement,
      MaterialDisbursementItem,
      MaterialDisbursementPackage,
      MaterialsDisbursementCounter,
      MaterialReceivingPackage,
      MaterialReceiving,
      StockBalance,
      StockTransaction,
      Material,
      Unit,
    ]),
  ],
  controllers: [MaterialsDisbursementController],
  providers: [MaterialsDisbursementService],
  exports: [MaterialsDisbursementService],
})
export class MaterialsDisbursementModule {}
