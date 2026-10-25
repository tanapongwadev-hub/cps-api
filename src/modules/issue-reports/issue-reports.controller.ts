import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { ActiveAssignmentGuard } from '../../common/guards/active-assignment.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import {
  CreateIssueReportDto,
  ListIssueReportsQueryDto,
  UpdateIssueReportDto,
} from './dto/issue-report.dto';
import { ISSUE_REPORT_PERMISSIONS as P } from './issue-report-permissions';
import { IssueReportsService } from './issue-reports.service';

@Controller('issue-reports')
@UseGuards(JwtAuthGuard, ActiveAssignmentGuard, PermissionGuard)
export class IssueReportsController {
  constructor(private readonly service: IssueReportsService) {}

  @Get()
  @RequirePermissions(P.VIEW)
  list(@Query() query: ListIssueReportsQueryDto) {
    return this.service.list(query);
  }

  @Post()
  @RequirePermissions(P.CREATE)
  create(@Body() dto: CreateIssueReportDto, @CurrentUser('id') userId: string) {
    return this.service.create(dto, userId);
  }

  @Patch(':id')
  @RequirePermissions(P.UPDATE)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateIssueReportDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.update(id, dto, userId);
  }
}
