import { Module } from '@nestjs/common';
import { AccessControlModule } from '../access-control/access-control.module';
import {
  SalesJobOrdersController,
  SalesOrdersController,
  SalesReportsController,
} from './sales.controller';
import { SalesService } from './sales.service';

@Module({
  // PermissionGuard resolves EffectivePermissionService from AccessControlModule.
  imports: [AccessControlModule],
  controllers: [SalesOrdersController, SalesJobOrdersController, SalesReportsController],
  providers: [SalesService],
})
export class SalesModule {}
