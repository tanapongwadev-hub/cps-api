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
import { CreateLocationDto } from './dto/create-location.dto';
import { ListLocationsQueryDto } from './dto/list-locations-query.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { LOCATION_PERMISSIONS } from './location-permissions';
import { LocationsService } from './locations.service';

@Controller('locations')
@UseGuards(JwtAuthGuard, ActiveAssignmentGuard, PermissionGuard)
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  @Get()
  @RequirePermissions(LOCATION_PERMISSIONS.VIEW)
  findAll(@Query() query: ListLocationsQueryDto) {
    return this.locationsService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions(LOCATION_PERMISSIONS.VIEW)
  findOne(@Param('id') id: string) {
    return this.locationsService.findOne(id);
  }

  @Post()
  @RequirePermissions(LOCATION_PERMISSIONS.CREATE)
  create(@Body() dto: CreateLocationDto, @CurrentUser('id') userId: string) {
    return this.locationsService.create(dto, userId);
  }

  @Patch(':id')
  @RequirePermissions(LOCATION_PERMISSIONS.UPDATE)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateLocationDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.locationsService.update(id, dto, userId);
  }

  @Delete(':id')
  @RequirePermissions(LOCATION_PERMISSIONS.DELETE)
  deactivate(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.locationsService.deactivate(id, userId);
  }

  @Patch(':id/restore')
  @RequirePermissions(LOCATION_PERMISSIONS.UPDATE)
  restore(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.locationsService.restore(id, userId);
  }
}
