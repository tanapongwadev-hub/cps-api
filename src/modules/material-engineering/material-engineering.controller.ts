import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { ActiveAssignmentGuard } from '../../common/guards/active-assignment.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { CreateMaterialBomDto, CreateMaterialWorkflowDto } from './material-engineering.dto';
import { MaterialEngineeringService } from './material-engineering.service';

@Controller('material-engineering')
@UseGuards(JwtAuthGuard, ActiveAssignmentGuard, PermissionGuard)
export class MaterialEngineeringController {
  constructor(private readonly service: MaterialEngineeringService) {}

  @Get('materials/with-bom') @RequirePermissions('MATERIAL_BOMS_VIEW')
  materialsWithBom() { return this.service.materialIdsWithBom(); }

  @Get('materials/:id/boms') @RequirePermissions('MATERIAL_BOMS_VIEW')
  boms(@Param('id') id: string) { return this.service.list(id, 'bom'); }

  @Get('materials/:id/workflows') @RequirePermissions('MATERIAL_WORKFLOWS_VIEW')
  workflows(@Param('id') id: string) { return this.service.list(id, 'workflow'); }

  @Post('boms') @RequirePermissions('MATERIAL_BOMS_CREATE')
  createBom(@Body() dto: CreateMaterialBomDto, @CurrentUser('id') userId: string) { return this.service.createBom(dto, userId); }

  @Post('workflows') @RequirePermissions('MATERIAL_WORKFLOWS_CREATE')
  createWorkflow(@Body() dto: CreateMaterialWorkflowDto, @CurrentUser('id') userId: string) { return this.service.createWorkflow(dto, userId); }

  @Patch('boms/:id/activate') @RequirePermissions('MATERIAL_BOMS_UPDATE')
  activateBom(@Param('id') id: string, @CurrentUser('id') userId: string) { return this.service.activate('bom', id, userId); }

  @Patch('workflows/:id/activate') @RequirePermissions('MATERIAL_WORKFLOWS_UPDATE')
  activateWorkflow(@Param('id') id: string, @CurrentUser('id') userId: string) { return this.service.activate('workflow', id, userId); }
}
