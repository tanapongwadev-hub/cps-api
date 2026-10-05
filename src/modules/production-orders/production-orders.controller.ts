import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { ActiveAssignmentGuard } from '../../common/guards/active-assignment.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { AdvancePacketDto } from './dto/advance-packet.dto';
import { CreateProductionOrderDto } from './dto/create-production-order.dto';
import { ListProductionOrdersQueryDto } from './dto/list-production-orders-query.dto';
import { CloseRemainingDto, RecordOutputDto } from './dto/record-output.dto';
import { PRODUCTION_ORDER_PERMISSIONS } from './production-order-permissions';
import { ProductionOrdersService } from './production-orders.service';

@Controller('production-orders')
@UseGuards(JwtAuthGuard, ActiveAssignmentGuard, PermissionGuard)
export class ProductionOrdersController {
  constructor(private readonly service: ProductionOrdersService) {}

  @Get()
  @RequirePermissions(PRODUCTION_ORDER_PERMISSIONS.VIEW)
  findAll(@Query() query: ListProductionOrdersQueryDto) {
    return this.service.findAll(query);
  }

  // Declared before ':id' so the literal prefix is never swallowed by it.
  @Post('packets/:packetId/advance')
  @RequirePermissions(PRODUCTION_ORDER_PERMISSIONS.ADVANCE)
  advance(
    @Param('packetId') packetId: string,
    @Body() dto: AdvancePacketDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.advancePacket(packetId, userId, dto?.quantity);
  }

  @Post('lines/:lineId/output')
  @RequirePermissions(PRODUCTION_ORDER_PERMISSIONS.ADVANCE)
  recordOutput(
    @Param('lineId') lineId: string,
    @Body() dto: RecordOutputDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.recordOutput(lineId, dto, userId);
  }

  @Post('lines/:lineId/close-remaining')
  @RequirePermissions(PRODUCTION_ORDER_PERMISSIONS.ADVANCE)
  closeRemaining(
    @Param('lineId') lineId: string,
    @Body() dto: CloseRemainingDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.closeRemaining(lineId, dto, userId);
  }

  @Get(':id')
  @RequirePermissions(PRODUCTION_ORDER_PERMISSIONS.VIEW)
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @RequirePermissions(PRODUCTION_ORDER_PERMISSIONS.CREATE)
  create(
    @Body() dto: CreateProductionOrderDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.create(dto, userId);
  }
}
