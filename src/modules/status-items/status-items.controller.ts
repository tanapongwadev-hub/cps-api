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
import { CreateStatusItemDto } from './dto/create-status-item.dto';
import { ListStatusItemsQueryDto } from './dto/list-status-items-query.dto';
import { UpdateStatusItemDto } from './dto/update-status-item.dto';
import { STATUS_ITEM_PERMISSIONS } from './status-item-permissions';
import { StatusItemsService } from './status-items.service';

@Controller('status-items')
@UseGuards(JwtAuthGuard, ActiveAssignmentGuard, PermissionGuard)
export class StatusItemsController {
  constructor(private readonly service: StatusItemsService) {}

  @Get() @RequirePermissions(STATUS_ITEM_PERMISSIONS.VIEW) findAll(
    @Query() q: ListStatusItemsQueryDto,
  ) {
    return this.service.findAll(q);
  }
  @Get(':id') @RequirePermissions(STATUS_ITEM_PERMISSIONS.VIEW) findOne(
    @Param('id') id: string,
  ) {
    return this.service.findOne(id);
  }
  @Post() @RequirePermissions(STATUS_ITEM_PERMISSIONS.CREATE) create(
    @Body() dto: CreateStatusItemDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.create(dto, userId);
  }
  @Patch(':id') @RequirePermissions(STATUS_ITEM_PERMISSIONS.UPDATE) update(
    @Param('id') id: string,
    @Body() dto: UpdateStatusItemDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.update(id, dto, userId);
  }
  @Delete(':id') @RequirePermissions(STATUS_ITEM_PERMISSIONS.DELETE) deactivate(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.deactivate(id, userId);
  }
  @Patch(':id/restore')
  @RequirePermissions(STATUS_ITEM_PERMISSIONS.UPDATE)
  restore(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.restore(id, userId);
  }
}
