import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
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
import { CloseService } from './close.service';
import { CloseRemainingDto } from './dto/close-remaining.dto';
import { ReverseDto } from './dto/reverse.dto';
import { HistoryService } from './history.service';
import { ProcessService } from './process.service';
import { ReconciliationService } from './reconciliation.service';
import { ReversalService } from './reversal.service';
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
    private readonly reversals: ReversalService,
    private readonly reconciliation: ReconciliationService,
    private readonly closes: CloseService,
    private readonly histories: HistoryService,
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

  /** Close pieces waiting at a step that will not be produced (reason required). */
  @Post('lines/:lineId/steps/:stepIndex/close-remaining')
  @RequirePermissions(PRODUCTION_ORDER_PERMISSIONS.ADVANCE)
  closeRemaining(
    @Param('lineId') lineId: string,
    @Param('stepIndex', ParseIntPipe) stepIndex: number,
    @Body() dto: CloseRemainingDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.closes.closeRemaining(lineId, stepIndex, dto, userId);
  }

  /** V10: take back a produce/transfer request whose pieces have not moved on. */
  @Post('lines/:lineId/requests/:requestId/reverse')
  @RequirePermissions(PRODUCTION_ORDER_PERMISSIONS.REVERSE)
  reverse(
    @Param('lineId') lineId: string,
    @Param('requestId', new ParseUUIDPipe()) requestId: string,
    @Body() dto: ReverseDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.reversals.reverse(lineId, requestId, dto, userId);
  }

  /** Every produce/receive/transfer/close request of the line, newest first. */
  @Get('lines/:lineId/history')
  @RequirePermissions(PRODUCTION_ORDER_PERMISSIONS.VIEW)
  history(@Param('lineId') lineId: string) {
    return this.histories.history(lineId);
  }

  /** Consistency check of one order line (state vs ledger vs origins). */
  @Get('lines/:lineId/reconciliation')
  @RequirePermissions(PRODUCTION_ORDER_PERMISSIONS.VIEW)
  reconcile(@Param('lineId') lineId: string) {
    return this.reconciliation.reconcile(lineId);
  }

  @Get('lines/:lineId/lots')
  @RequirePermissions(PRODUCTION_ORDER_PERMISSIONS.VIEW)
  listLineLots(@Param('lineId') lineId: string) {
    return this.service.listLineLots(lineId);
  }
}
