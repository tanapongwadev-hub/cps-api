import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { ActiveAssignmentGuard } from '../../../common/guards/active-assignment.guard';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { PRODUCTION_ORDER_PERMISSIONS } from '../../production-orders/production-order-permissions';
import { ProduceDto } from './dto/produce.dto';
import { ProcessService } from './process.service';

/**
 * Lot-model production movements. Steps are addressed by order line + step
 * index (a process can appear twice in one workflow). Permissions reuse the
 * production-order codes until the dedicated ones arrive (plan Phase 8).
 */
@Controller('production')
@UseGuards(JwtAuthGuard, ActiveAssignmentGuard, PermissionGuard)
export class ProcessController {
  constructor(private readonly service: ProcessService) {}

  @Post('lines/:lineId/steps/:stepIndex/produce')
  @RequirePermissions(PRODUCTION_ORDER_PERMISSIONS.ADVANCE)
  produce(
    @Param('lineId') lineId: string,
    @Param('stepIndex', ParseIntPipe) stepIndex: number,
    @Body() dto: ProduceDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.produce(lineId, stepIndex, dto, userId);
  }

  @Get('lines/:lineId/lots')
  @RequirePermissions(PRODUCTION_ORDER_PERMISSIONS.VIEW)
  listLineLots(@Param('lineId') lineId: string) {
    return this.service.listLineLots(lineId);
  }
}
