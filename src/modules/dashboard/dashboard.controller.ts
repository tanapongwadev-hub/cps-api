import {
  BadRequestException,
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { RequireAnyPermissions } from '../../common/decorators/require-any-permissions.decorator';
import { RoleCode } from '../../common/enums/role-code.enum';
import { ActiveAssignmentGuard } from '../../common/guards/active-assignment.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import type { CurrentUserWithAssignment } from '../../common/interfaces/current-user.interface';
import { EffectivePermissionService } from '../access-control/services/effective-permission.service';
import { DashboardService } from './dashboard.service';
import { ProductsDashboardService } from './products-dashboard.service';
import {
  MATERIALS_DASHBOARD_MAX_DAYS,
  MaterialsDashboardService,
} from './materials-dashboard.service';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

function bangkokToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(
    new Date(),
  );
}

// The home summary is aggregate counts any signed-in user may see. The
// materials dashboard carries quantities, so it has its own permission gate.
@Controller('dashboard')
@UseGuards(JwtAuthGuard, ActiveAssignmentGuard)
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly materialsDashboard: MaterialsDashboardService,
    private readonly productsDashboard: ProductsDashboardService,
    private readonly effectivePermissions: EffectivePermissionService,
  ) {}

  /** Validates ?from/?to (Bangkok dates); defaults to the last 30 days. */
  private resolveRange(fromParam?: string, toParam?: string) {
    const to = toParam && DATE.test(toParam) ? toParam : bangkokToday();
    const from =
      fromParam && DATE.test(fromParam)
        ? fromParam
        : new Date(Date.parse(`${to}T00:00:00Z`) - 29 * DAY_MS)
            .toISOString()
            .slice(0, 10);
    const days =
      (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
        DAY_MS +
      1;
    if (!Number.isFinite(days) || days < 1) {
      throw new BadRequestException('วันที่เริ่มต้นต้องไม่เกินวันที่สิ้นสุด');
    }
    if (days > MATERIALS_DASHBOARD_MAX_DAYS) {
      throw new BadRequestException(
        `เลือกช่วงวันที่ได้ไม่เกิน ${MATERIALS_DASHBOARD_MAX_DAYS} วัน`,
      );
    }
    return { from, to };
  }

  @Get('summary')
  getSummary() {
    return this.dashboardService.getSummary();
  }

  /** Receiving / disbursement overview for a date range (default last 30 days). */
  @Get('materials')
  @UseGuards(PermissionGuard)
  @RequireAnyPermissions(
    'MATERIALS_RECEIVING_VIEW',
    'MATERIALS_DISBURSEMENT_VIEW',
  )
  async materials(
    @Query('from') fromParam: string | undefined,
    @Query('to') toParam: string | undefined,
    @CurrentUser() user: CurrentUserWithAssignment,
  ) {
    const { from, to } = this.resolveRange(fromParam, toParam);
    const isSuperAdmin = user.activeRoleCode === RoleCode.SUPER_ADMIN;
    const granted = new Set(
      await this.effectivePermissions.getEffectivePermissionCodes(
        user.id,
        user.activeUserDepartmentRoleId ?? undefined,
        isSuperAdmin,
      ),
    );
    return this.materialsDashboard.getOverview(
      { from, to },
      {
        receiving: isSuperAdmin || granted.has('MATERIALS_RECEIVING_VIEW'),
        disbursement:
          isSuperAdmin || granted.has('MATERIALS_DISBURSEMENT_VIEW'),
      },
    );
  }

  /** Movements of one product (by code) in the range, for the detail dialog. */
  @Get('products/movements')
  @UseGuards(PermissionGuard)
  @RequirePermissions('PRODUCTS_VIEW')
  productMovements(
    @Query('code') code: string | undefined,
    @Query('from') fromParam: string | undefined,
    @Query('to') toParam: string | undefined,
  ) {
    if (!code?.trim()) throw new BadRequestException('กรุณาระบุรหัสสินค้า');
    return this.productsDashboard.getProductMovements(code.trim(), this.resolveRange(fromParam, toParam));
  }

  /** Finished-product receive / issue overview for a date range. */
  @Get('products')
  @UseGuards(PermissionGuard)
  @RequirePermissions('PRODUCTS_VIEW')
  products(
    @Query('from') fromParam: string | undefined,
    @Query('to') toParam: string | undefined,
  ) {
    return this.productsDashboard.getOverview(this.resolveRange(fromParam, toParam));
  }
}
