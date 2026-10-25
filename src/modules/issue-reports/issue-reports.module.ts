import { Module } from '@nestjs/common';
import { AccessControlModule } from '../access-control/access-control.module';
import { IssueReportsController } from './issue-reports.controller';
import { IssueReportsService } from './issue-reports.service';

@Module({
  // PermissionGuard resolves EffectivePermissionService from AccessControlModule.
  imports: [AccessControlModule],
  controllers: [IssueReportsController],
  providers: [IssueReportsService],
})
export class IssueReportsModule {}
