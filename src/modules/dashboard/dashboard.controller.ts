import { Controller, Get, UseGuards } from '@nestjs/common';
import { ActiveAssignmentGuard } from '../../common/guards/active-assignment.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { DashboardService } from './dashboard.service';

// Deliberately no PermissionGuard: the summary is aggregate counts for the
// home dashboard and every signed-in user may see it.
@Controller('dashboard')
@UseGuards(JwtAuthGuard, ActiveAssignmentGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  getSummary() {
    return this.dashboardService.getSummary();
  }
}
