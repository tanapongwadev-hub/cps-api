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
import { CreateMaterialModelDto } from './dto/create-material-model.dto';
import { ListMaterialModelsQueryDto } from './dto/list-material-models-query.dto';
import { UpdateMaterialModelDto } from './dto/update-material-model.dto';
import { MATERIAL_MODEL_PERMISSIONS } from './material-model-permissions';
import { MaterialModelsService } from './material-models.service';

@Controller('material-models')
@UseGuards(JwtAuthGuard, ActiveAssignmentGuard, PermissionGuard)
export class MaterialModelsController {
  constructor(private readonly materialModelsService: MaterialModelsService) {}

  @Get()
  @RequirePermissions(MATERIAL_MODEL_PERMISSIONS.VIEW)
  findAll(@Query() query: ListMaterialModelsQueryDto) {
    return this.materialModelsService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions(MATERIAL_MODEL_PERMISSIONS.VIEW)
  findOne(@Param('id') id: string) {
    return this.materialModelsService.findOne(id);
  }

  @Post()
  @RequirePermissions(MATERIAL_MODEL_PERMISSIONS.CREATE)
  create(
    @Body() dto: CreateMaterialModelDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.materialModelsService.create(dto, userId);
  }

  @Patch(':id')
  @RequirePermissions(MATERIAL_MODEL_PERMISSIONS.UPDATE)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateMaterialModelDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.materialModelsService.update(id, dto, userId);
  }

  @Delete(':id')
  @RequirePermissions(MATERIAL_MODEL_PERMISSIONS.DELETE)
  deactivate(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.materialModelsService.deactivate(id, userId);
  }

  @Patch(':id/restore')
  @RequirePermissions(MATERIAL_MODEL_PERMISSIONS.UPDATE)
  restore(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.materialModelsService.restore(id, userId);
  }
}
