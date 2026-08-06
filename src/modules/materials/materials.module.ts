import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { resolve as resolvePath } from 'node:path';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { DeliveryType } from '../../entities/master/delivery-type.entity';
import { LoadingPoint } from '../../entities/master/loading-point.entity';
import { MaterialModel } from '../../entities/master/material-model.entity';
import { Material } from '../../entities/master/material.entity';
import { SupplierMaterial } from '../../entities/master/supplier-material.entity';
import { Supplier } from '../../entities/master/supplier.entity';
import { Unit } from '../../entities/master/unit.entity';
import { AccessControlModule } from '../access-control/access-control.module';
import {
  MATERIAL_IMAGE_ROOT,
  MaterialImageStorageService,
} from './material-image-storage.service';
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
  providers: [
    MaterialsService,
    {
      provide: MATERIAL_IMAGE_ROOT,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const configured = configService.get<string>('MATERIAL_IMAGE_ROOT');
        if (typeof configured === 'string' && configured.trim() !== '') {
          // Honour the explicit override but make it absolute relative to
          // the API's working directory, so the operator can use either
          // `D:/project-cps/New/image` or `./uploads/materials`-style
          // paths without surprises.
          return resolvePath(configured.trim());
        }
        return undefined;
      },
    },
    MaterialImageStorageService,
    PermissionGuard,
  ],
  exports: [MaterialsService, MaterialImageStorageService, PermissionGuard],
})
export class MaterialsModule {}
