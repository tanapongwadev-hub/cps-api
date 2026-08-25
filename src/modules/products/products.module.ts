import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
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
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
