import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { DeliveryType } from '../../entities/master/delivery-type.entity';
import { LoadingPoint } from '../../entities/master/loading-point.entity';
import { MaterialModel } from '../../entities/master/material-model.entity';
import { Material } from '../../entities/master/material.entity';
import { SupplierMaterial } from '../../entities/master/supplier-material.entity';
import { Supplier } from '../../entities/master/supplier.entity';
import { Unit } from '../../entities/master/unit.entity';
import { AccessControlModule } from '../access-control/access-control.module';
import { MaterialImageStorageService } from './material-image-storage.service';
import { MaterialsController } from './materials.controller';
import { MaterialsService } from './materials.service';

@Module({
  imports: [
    AccessControlModule,
    TypeOrmModule.forFeature([
      Material,
      SupplierMaterial,
      Unit,
      DeliveryType,
      MaterialModel,
      LoadingPoint,
      Supplier,
    ]),
  ],
  controllers: [MaterialsController],
  providers: [MaterialsService, MaterialImageStorageService, PermissionGuard],
  exports: [MaterialsService, MaterialImageStorageService, PermissionGuard],
})
export class MaterialsModule {}
