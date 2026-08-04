import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { DeliveryType } from '../../entities/master/delivery-type.entity';
import { AccessControlModule } from '../access-control/access-control.module';
import { DeliveryTypesController } from './delivery-types.controller';
import { DeliveryTypesService } from './delivery-types.service';

@Module({
  imports: [AccessControlModule, TypeOrmModule.forFeature([DeliveryType])],
  controllers: [DeliveryTypesController],
  providers: [DeliveryTypesService, PermissionGuard],
  exports: [DeliveryTypesService],
})
export class DeliveryTypesModule {}
