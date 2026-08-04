import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { MaterialModel } from '../../entities/master/material-model.entity';
import { AccessControlModule } from '../access-control/access-control.module';
import { MaterialModelsController } from './material-models.controller';
import { MaterialModelsService } from './material-models.service';

@Module({
  imports: [AccessControlModule, TypeOrmModule.forFeature([MaterialModel])],
  controllers: [MaterialModelsController],
  providers: [MaterialModelsService, PermissionGuard],
  exports: [MaterialModelsService],
})
export class MaterialModelsModule {}
