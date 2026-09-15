import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { MaterialTypeMaster } from '../../entities/master/material-type.entity';
import { AccessControlModule } from '../access-control/access-control.module';
import { MaterialTypesController } from './material-types.controller';
import { MaterialTypesService } from './material-types.service';

@Module({
  imports: [
    AccessControlModule,
    TypeOrmModule.forFeature([MaterialTypeMaster]),
  ],
  controllers: [MaterialTypesController],
  providers: [MaterialTypesService, PermissionGuard],
  exports: [MaterialTypesService],
})
export class MaterialTypesModule {}
