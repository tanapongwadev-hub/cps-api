import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { MaterialReceivingLotCounter } from '../../entities/inventory/material-receiving-lot-counter.entity';
import { MaterialReceivingPackage } from '../../entities/inventory/material-receiving-package.entity';
import { MaterialReceiving } from '../../entities/inventory/material-receiving.entity';
import { StockBalance } from '../../entities/inventory/stock-balance.entity';
import { StockTransaction } from '../../entities/inventory/stock-transaction.entity';
import { Material } from '../../entities/master/material.entity';
import { Organization } from '../../entities/master/organization.entity';
import { SupplierMaterial } from '../../entities/master/supplier-material.entity';
import { Supplier } from '../../entities/master/supplier.entity';
import { Unit } from '../../entities/master/unit.entity';
import { AccessControlModule } from '../access-control/access-control.module';
import { MaterialsReceivingController } from './materials-receiving.controller';
import { MaterialsReceivingService } from './materials-receiving.service';

@Module({
  imports: [
    AccessControlModule,
    TypeOrmModule.forFeature([
      MaterialReceiving,
      MaterialReceivingPackage,
      MaterialReceivingLotCounter,
      StockBalance,
      StockTransaction,
      Material,
      Supplier,
      SupplierMaterial,
      Unit,
      Organization,
    ]),
  ],
  controllers: [MaterialsReceivingController],
  providers: [MaterialsReceivingService, PermissionGuard],
  exports: [MaterialsReceivingService],
})
export class MaterialsReceivingModule {}
