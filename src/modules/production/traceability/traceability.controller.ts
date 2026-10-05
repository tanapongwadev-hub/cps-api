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
import { TraceabilityService } from './traceability.service';

/** Lot / box traceability (read-only). */
@Controller('production')
@UseGuards(JwtAuthGuard, ActiveAssignmentGuard, PermissionGuard)
export class TraceabilityController {
  constructor(private readonly service: TraceabilityService) {}

  /** Scan box: a box QR code (QR-…) or a lot number. */
  @Get('traceability/scan')
  @RequirePermissions(PRODUCTION_ORDER_PERMISSIONS.VIEW)
  scan(@Query('q') q?: string) {
    if (!q?.trim()) throw new BadRequestException('กรุณาระบุ QR หรือเลข Lot');
    return this.service.scan(q);
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
