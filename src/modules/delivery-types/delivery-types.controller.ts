import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { ActiveAssignmentGuard } from '../../common/guards/active-assignment.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { CreateDeliveryTypeDto } from './dto/create-delivery-type.dto';
import { ListDeliveryTypesQueryDto } from './dto/list-delivery-types-query.dto';
import { UpdateDeliveryTypeDto } from './dto/update-delivery-type.dto';
import { DELIVERY_TYPE_PERMISSIONS } from './delivery-type-permissions';
import { DeliveryTypesService } from './delivery-types.service';

@Controller('delivery-types')
@UseGuards(JwtAuthGuard, ActiveAssignmentGuard, PermissionGuard)
export class DeliveryTypesController {
  constructor(private readonly deliveryTypesService: DeliveryTypesService) {}

  @Get()
  @RequirePermissions(DELIVERY_TYPE_PERMISSIONS.VIEW)
  findAll(@Query() query: ListDeliveryTypesQueryDto) {
    return this.deliveryTypesService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions(DELIVERY_TYPE_PERMISSIONS.VIEW)
  findOne(@Param('id') id: string) {
    return this.deliveryTypesService.findOne(id);
  }

  @Post()
  @RequirePermissions(DELIVERY_TYPE_PERMISSIONS.CREATE)
  create(
    @Body() dto: CreateDeliveryTypeDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.deliveryTypesService.create(dto, userId);
  }

  @Patch(':id')
  @RequirePermissions(DELIVERY_TYPE_PERMISSIONS.UPDATE)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateDeliveryTypeDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.deliveryTypesService.update(id, dto, userId);
  }

  @Delete(':id')
  @RequirePermissions(DELIVERY_TYPE_PERMISSIONS.DELETE)
  deactivate(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.deliveryTypesService.deactivate(id, userId);
  }

  @Patch(':id/restore')
  @RequirePermissions(DELIVERY_TYPE_PERMISSIONS.UPDATE)
  restore(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.deliveryTypesService.restore(id, userId);
  }
}
