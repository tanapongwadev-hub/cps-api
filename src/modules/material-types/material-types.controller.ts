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
import { CreateMaterialTypeDto } from './dto/create-material-type.dto';
import { ListMaterialTypesQueryDto } from './dto/list-material-types-query.dto';
import { UpdateMaterialTypeDto } from './dto/update-material-type.dto';
import { MATERIAL_TYPE_PERMISSIONS } from './material-type-permissions';
import { MaterialTypesService } from './material-types.service';

@Controller('material-types')
@UseGuards(JwtAuthGuard, ActiveAssignmentGuard, PermissionGuard)
export class MaterialTypesController {
  constructor(private readonly materialTypesService: MaterialTypesService) {}

  @Get()
  @RequirePermissions(MATERIAL_TYPE_PERMISSIONS.VIEW)
  findAll(@Query() query: ListMaterialTypesQueryDto) {
    return this.materialTypesService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions(MATERIAL_TYPE_PERMISSIONS.VIEW)
  findOne(@Param('id') id: string) {
    return this.materialTypesService.findOne(id);
  }

  @Post()
  @RequirePermissions(MATERIAL_TYPE_PERMISSIONS.CREATE)
  create(
    @Body() dto: CreateMaterialTypeDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.materialTypesService.create(dto, userId);
  }

  @Patch(':id')
  @RequirePermissions(MATERIAL_TYPE_PERMISSIONS.UPDATE)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateMaterialTypeDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.materialTypesService.update(id, dto, userId);
  }

  @Delete(':id')
  @RequirePermissions(MATERIAL_TYPE_PERMISSIONS.DELETE)
  deactivate(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.materialTypesService.deactivate(id, userId);
  }

  @Patch(':id/restore')
  @RequirePermissions(MATERIAL_TYPE_PERMISSIONS.UPDATE)
  restore(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.materialTypesService.restore(id, userId);
  }
}
