import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ProductModel } from '../../entities/master/product-model.entity';
import { AccessControlModule } from '../access-control/access-control.module';
import { ProductModelsController } from './product-models.controller';
import { ProductModelsService } from './product-models.service';

@Module({
  imports: [AccessControlModule, TypeOrmModule.forFeature([ProductModel])],
  controllers: [ProductModelsController],
  providers: [ProductModelsService, PermissionGuard],
  exports: [ProductModelsService],
})
export class ProductModelsModule {}
