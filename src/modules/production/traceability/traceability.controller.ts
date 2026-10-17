import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { ActiveAssignmentGuard } from '../../../common/guards/active-assignment.guard';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { PRODUCTION_ORDER_PERMISSIONS } from '../../production-orders/production-order-permissions';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RoleCode } from '../../../common/enums/role-code.enum';
import type { CurrentUserWithAssignment } from '../../../common/interfaces/current-user.interface';
import { EffectivePermissionService } from '../../access-control/services/effective-permission.service';
import { TraceabilityService } from './traceability.service';

/** Lot / box traceability (read-only). */
@Controller('production')
@UseGuards(JwtAuthGuard, ActiveAssignmentGuard, PermissionGuard)
export class TraceabilityController {
  constructor(
    private readonly service: TraceabilityService,
    private readonly effectivePermissions: EffectivePermissionService,
  ) {}

  /** Scan box: a box QR code (QR-…) or a lot number. */
  @Get('traceability/scan')
  @RequirePermissions(PRODUCTION_ORDER_PERMISSIONS.VIEW)
  scan(@Query('q') q?: string) {
    if (!q?.trim()) throw new BadRequestException('กรุณาระบุ QR หรือเลข Lot');
    return this.service.scan(q);
  }

  /**
   * Product lot: production dates, sales shipments and material lots issued
   * to its plan. Sales rows need a sales permission and material lots need
   * MATERIALS_RECEIVING_VIEW; sections the caller lacks come back empty with
   * `access.<section> = false`.
   */
  @Get('traceability/commercial')
  @RequirePermissions(PRODUCTION_ORDER_PERMISSIONS.VIEW)
  async commercial(@Query('q') q: string | undefined, @CurrentUser() user: CurrentUserWithAssignment) {
    if (!q?.trim()) throw new BadRequestException('กรุณาระบุ QR หรือเลข Lot');
    const isSuperAdmin = user.activeRoleCode === RoleCode.SUPER_ADMIN;
    const granted = new Set(
      await this.effectivePermissions.getEffectivePermissionCodes(
        user.id,
        user.activeUserDepartmentRoleId ?? undefined,
        isSuperAdmin,
      ),
    );
    const has = (...codes: string[]) => isSuperAdmin || codes.some((code) => granted.has(code));
    return this.service.commercialTrace(q, {
      sales: has('SALES_REPORT_VIEW', 'SALES_JOB_ORDER_VIEW', 'SALES_ORDER_VIEW'),
      materials: has('MATERIALS_RECEIVING_VIEW', 'MATERIAL_JOB_ORDER_VIEW'),
    });
  }

  @Get('packages/:qrCode/traceability')
  @RequirePermissions(PRODUCTION_ORDER_PERMISSIONS.VIEW)
  traceByQrCode(@Param('qrCode') qrCode: string) {
    return this.service.traceByQrCode(qrCode);
  }

  @Get('lots/:lotId/traceability')
  @RequirePermissions(PRODUCTION_ORDER_PERMISSIONS.VIEW)
  traceLot(
    @Param('lotId') lotId: string,
    @Query('direction') direction?: string,
  ) {
    return this.service.traceLot(
      lotId,
      direction === 'forward' ? 'forward' : 'backward',
    );
  }

  @Get('orders/:orderId/traceability')
  @RequirePermissions(PRODUCTION_ORDER_PERMISSIONS.VIEW)
  traceOrder(@Param('orderId') orderId: string) {
    return this.service.traceOrder(orderId);
  }
}
