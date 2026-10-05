import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { ActiveAssignmentGuard } from '../../../common/guards/active-assignment.guard';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { PRODUCTION_ORDER_PERMISSIONS } from '../../production-orders/production-order-permissions';
import { BoardService } from './board.service';
import { ProduceDto } from './dto/produce.dto';
import { TransferDto } from './dto/transfer.dto';
import { ProcessService } from './process.service';
import { TransferService } from './transfer.service';

/**
 * Lot-model production movements. Steps are addressed by order line + step
 * index (a process can appear twice in one workflow). Permissions reuse the
 * production-order codes until the dedicated ones arrive (plan Phase 8).
 */
@Controller('production')
@UseGuards(JwtAuthGuard, ActiveAssignmentGuard, PermissionGuard)
export class ProcessController {
  constructor(
    private readonly service: ProcessService,
    private readonly transfers: TransferService,
    private readonly boards: BoardService,
  ) {}

  @Post('lines/:lineId/steps/:stepIndex/transfer')
  @RequirePermissions(PRODUCTION_ORDER_PERMISSIONS.ADVANCE)
  transfer(
    @Param('lineId') lineId: string,
    @Param('stepIndex', ParseIntPipe) stepIndex: number,
    @Body() dto: TransferDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.transfers.transfer(lineId, stepIndex, dto, userId);
  }

  /** Process Board: per-step input/produced/waiting/ready/transferred/rejected + lots. */
  @Get('lines/:lineId/board')
  @RequirePermissions(PRODUCTION_ORDER_PERMISSIONS.VIEW)
  board(@Param('lineId') lineId: string) {
    return this.boards.board(lineId);
  }

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

  /** Source lots waiting at a step (+ FIFO split of `qty`) for MANUAL produce. */
  @Get('lines/:lineId/steps/:stepIndex/allocation-preview')
  @RequirePermissions(PRODUCTION_ORDER_PERMISSIONS.VIEW)
  allocationPreview(
    @Param('lineId') lineId: string,
    @Param('stepIndex', ParseIntPipe) stepIndex: number,
    @Query('qty', new ParseIntPipe({ optional: true })) qty?: number,
  ) {
    if (qty !== undefined && qty < 1) {
      throw new BadRequestException('จำนวนต้องมากกว่า 0');
    }
    return this.service.allocationPreview(lineId, stepIndex, qty);
  }

  @Get('lines/:lineId/lots')
  @RequirePermissions(PRODUCTION_ORDER_PERMISSIONS.VIEW)
  listLineLots(@Param('lineId') lineId: string) {
    return this.service.listLineLots(lineId);
  }
}
