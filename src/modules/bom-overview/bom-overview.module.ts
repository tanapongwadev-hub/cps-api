import { Module } from '@nestjs/common';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { AccessControlModule } from '../access-control/access-control.module';
import { BomOverviewController } from './bom-overview.controller';
import { BomOverviewService } from './bom-overview.service';

@Module({
  imports: [AccessControlModule],
  controllers: [BomOverviewController],
  providers: [BomOverviewService, PermissionGuard],
})
export class BomOverviewModule {}
