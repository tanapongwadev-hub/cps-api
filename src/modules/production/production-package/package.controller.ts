import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { ActiveAssignmentGuard } from '../../../common/guards/active-assignment.guard';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { PRODUCTION_ORDER_PERMISSIONS } from '../../production-orders/production-order-permissions';
import { GeneratePackagesDto } from './dto/generate-packages.dto';
import { PackageService } from './package.service';

/** FG/STORE boxes + QR. Permissions reuse production-order codes until Phase 8. */
@Controller('production')
@UseGuards(JwtAuthGuard, ActiveAssignmentGuard, PermissionGuard)
export class PackageController {
  constructor(private readonly service: PackageService) {}

  @Post('packages/generate')
  @RequirePermissions(PRODUCTION_ORDER_PERMISSIONS.ADVANCE)
  generate(
    @Body() dto: GeneratePackagesDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.generate(dto, userId);
  }

  @Get('lots/:lotId/packages')
  @RequirePermissions(PRODUCTION_ORDER_PERMISSIONS.VIEW)
  listByLot(@Param('lotId') lotId: string) {
    return this.service.listByLot(lotId);
  }
}
