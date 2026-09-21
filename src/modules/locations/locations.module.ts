import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { Location } from '../../entities/master/location.entity';
import { AccessControlModule } from '../access-control/access-control.module';
import { LocationsController } from './locations.controller';
import { LocationsService } from './locations.service';

@Module({
  imports: [AccessControlModule, TypeOrmModule.forFeature([Location])],
  controllers: [LocationsController],
  providers: [LocationsService, PermissionGuard],
  exports: [LocationsService],
})
export class LocationsModule {}
