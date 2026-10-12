import { Module } from '@nestjs/common';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { AccessControlModule } from '../access-control/access-control.module';
import { MaterialsReceivingModule } from '../materials-receiving/materials-receiving.module';
import { MaterialProcessingController } from './material-processing.controller';
import { MaterialProcessingService } from './material-processing.service';

@Module({
  imports: [AccessControlModule, MaterialsReceivingModule],
  controllers: [MaterialProcessingController],
  providers: [MaterialProcessingService, PermissionGuard],
})
export class MaterialProcessingModule {}
