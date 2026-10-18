import { Controller, Get, UseGuards } from '@nestjs/common';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { ActiveAssignmentGuard } from '../../common/guards/active-assignment.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { BomOverviewService } from './bom-overview.service';

// ดูอย่างเดียว — ใช้แสดงรายการในหน้า "สร้างครบชุด" ให้ทุก role ที่มีสิทธิ์ SETUP_WIZARD_VIEW (ขอบเขต ALL)
@Controller('bom-overview')
@UseGuards(JwtAuthGuard, ActiveAssignmentGuard, PermissionGuard)
export class BomOverviewController {
  constructor(private readonly service: BomOverviewService) {}

  @Get()
  @RequirePermissions('SETUP_WIZARD_VIEW')
  overview() {
    return this.service.overview();
  }
}
