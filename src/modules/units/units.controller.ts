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
import { CreateUnitDto } from './dto/create-unit.dto';
import { ListUnitsQueryDto } from './dto/list-units-query.dto';
import { UpdateUnitDto } from './dto/update-unit.dto';
import { UNIT_PERMISSIONS } from './unit-permissions';
import { UnitsService } from './units.service';

@Controller('units')
@UseGuards(JwtAuthGuard, ActiveAssignmentGuard, PermissionGuard)
export class UnitsController {
  constructor(private readonly unitsService: UnitsService) {}

  @Get()
  @RequirePermissions(UNIT_PERMISSIONS.VIEW)
  findAll(@Query() query: ListUnitsQueryDto) {
    return this.unitsService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions(UNIT_PERMISSIONS.VIEW)
  findOne(@Param('id') id: string) {
    return this.unitsService.findOne(id);
  }

  @Post()
  @RequirePermissions(UNIT_PERMISSIONS.CREATE)
  create(@Body() dto: CreateUnitDto, @CurrentUser('id') userId: string) {
    return this.unitsService.create(dto, userId);
  }

  @Patch(':id')
  @RequirePermissions(UNIT_PERMISSIONS.UPDATE)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUnitDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.unitsService.update(id, dto, userId);
  }

  @Delete(':id')
  @RequirePermissions(UNIT_PERMISSIONS.DELETE)
  deactivate(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.unitsService.deactivate(id, userId);
  }

  @Patch(':id/restore')
  @RequirePermissions(UNIT_PERMISSIONS.UPDATE)
  restore(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.unitsService.restore(id, userId);
  }
}
