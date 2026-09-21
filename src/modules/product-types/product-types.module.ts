import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ProductType } from '../../entities/master/product-type.entity';
import { AccessControlModule } from '../access-control/access-control.module';
import { ProductTypesController } from './product-types.controller';
import { ProductTypesService } from './product-types.service';

@Module({
  imports: [AccessControlModule, TypeOrmModule.forFeature([ProductType])],
  controllers: [ProductTypesController],
  providers: [ProductTypesService, PermissionGuard],
  exports: [ProductTypesService],
})
export class ProductTypesModule {}
