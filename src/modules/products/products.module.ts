import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { resolve as resolvePath } from 'node:path';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { Product } from '../../entities/master/product.entity';
import { ProductModel } from '../../entities/master/product-model.entity';
import { Customer } from '../../entities/master/customer.entity';
import { Location } from '../../entities/master/location.entity';
import { ProductType } from '../../entities/master/product-type.entity';
import { DeliveryType } from '../../entities/master/delivery-type.entity';
import { LoadingPoint } from '../../entities/master/loading-point.entity';
import { ProcessLine } from '../../entities/master/process-line.entity';
import { Unit } from '../../entities/master/unit.entity';
import { AccessControlModule } from '../access-control/access-control.module';
import { ProductsController } from './products.controller';
import {
  PRODUCT_IMAGE_ROOT,
  ProductImageStorageService,
} from './product-image-storage.service';
import { ProductsService } from './products.service';

@Module({
  imports: [
    AccessControlModule,
    TypeOrmModule.forFeature([
      Product,
      ProductModel,
      Customer,
      Location,
      ProductType,
      DeliveryType,
      LoadingPoint,
      ProcessLine,
      Unit,
    ]),
  ],
  controllers: [ProductsController],
  providers: [
    ProductsService,
    {
      provide: PRODUCT_IMAGE_ROOT,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const configured = configService.get<string>('PRODUCT_IMAGE_ROOT');
        if (typeof configured === 'string' && configured.trim() !== '') {
          return resolvePath(configured.trim());
        }
        return undefined;
      },
    },
    ProductImageStorageService,
    PermissionGuard,
  ],
  exports: [ProductsService, ProductImageStorageService],
})
export class ProductsModule {}
