import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { LoadingPoint } from '../../entities/master/loading-point.entity';
import { AccessControlModule } from '../access-control/access-control.module';
import { LoadingPointsController } from './loading-points.controller';
import { LoadingPointsService } from './loading-points.service';

@Module({
  imports: [AccessControlModule, TypeOrmModule.forFeature([LoadingPoint])],
  controllers: [LoadingPointsController],
  providers: [LoadingPointsService, PermissionGuard],
  exports: [LoadingPointsService],
})
export class LoadingPointsModule {}
