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
import { CreateLoadingPointDto } from './dto/create-loading-point.dto';
import { ListLoadingPointsQueryDto } from './dto/list-loading-points-query.dto';
import { UpdateLoadingPointDto } from './dto/update-loading-point.dto';
import { LOADING_POINT_PERMISSIONS } from './loading-point-permissions';
import { LoadingPointsService } from './loading-points.service';

@Controller('loading-points')
@UseGuards(JwtAuthGuard, ActiveAssignmentGuard, PermissionGuard)
export class LoadingPointsController {
  constructor(private readonly loadingPointsService: LoadingPointsService) {}

  @Get()
  @RequirePermissions(LOADING_POINT_PERMISSIONS.VIEW)
  findAll(@Query() query: ListLoadingPointsQueryDto) {
    return this.loadingPointsService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions(LOADING_POINT_PERMISSIONS.VIEW)
  findOne(@Param('id') id: string) {
    return this.loadingPointsService.findOne(id);
  }

  @Post()
  @RequirePermissions(LOADING_POINT_PERMISSIONS.CREATE)
  create(
    @Body() dto: CreateLoadingPointDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.loadingPointsService.create(dto, userId);
  }

  @Patch(':id')
  @RequirePermissions(LOADING_POINT_PERMISSIONS.UPDATE)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateLoadingPointDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.loadingPointsService.update(id, dto, userId);
  }

  @Delete(':id')
  @RequirePermissions(LOADING_POINT_PERMISSIONS.DELETE)
  deactivate(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.loadingPointsService.deactivate(id, userId);
  }

  @Patch(':id/restore')
  @RequirePermissions(LOADING_POINT_PERMISSIONS.UPDATE)
  restore(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.loadingPointsService.restore(id, userId);
  }
}
