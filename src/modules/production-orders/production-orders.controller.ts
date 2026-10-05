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
import { CreateProductionOrderDto } from './dto/create-production-order.dto';
import { ListProductionOrdersQueryDto } from './dto/list-production-orders-query.dto';
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
    @CurrentUser('id') userId: string,
  ) {
    return this.service.advancePacket(packetId, userId);
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
