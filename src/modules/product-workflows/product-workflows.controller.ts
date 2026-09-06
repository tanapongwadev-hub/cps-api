import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { ActiveAssignmentGuard } from '../../common/guards/active-assignment.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { PRODUCT_WORKFLOWS_PERMISSIONS } from './product-workflows-permissions';
import { ProductWorkflowsService } from './product-workflows.service';
import { CreateProductWorkflowDto } from './dto/create-product-workflow.dto';
import {
  UpdateProductWorkflowDto,
  AddProductWorkflowStepDto,
} from './dto/update-product-workflow.dto';

@Controller('product-workflows')
@UseGuards(JwtAuthGuard, ActiveAssignmentGuard, PermissionGuard)
export class ProductWorkflowsController {
  constructor(private readonly workflowsService: ProductWorkflowsService) {}

  @Get('product/:productId')
  @RequirePermissions(PRODUCT_WORKFLOWS_PERMISSIONS.VIEW)
  findByProduct(@Param('productId') productId: string) {
    return this.workflowsService.findByProduct(productId);
  }

  @Get(':id')
  @RequirePermissions(PRODUCT_WORKFLOWS_PERMISSIONS.VIEW)
  findOne(@Param('id') id: string) {
    return this.workflowsService.findOne(id);
  }

  @Post()
  @RequirePermissions(PRODUCT_WORKFLOWS_PERMISSIONS.CREATE)
  create(
    @Body() dto: CreateProductWorkflowDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.workflowsService.create(dto, userId);
  }

  @Patch(':id')
  @RequirePermissions(PRODUCT_WORKFLOWS_PERMISSIONS.UPDATE)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProductWorkflowDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.workflowsService.update(id, dto, userId);
  }

  @Post(':id/steps')
  @RequirePermissions(PRODUCT_WORKFLOWS_PERMISSIONS.UPDATE)
  addStep(
    @Param('id') id: string,
    @Body() dto: AddProductWorkflowStepDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.workflowsService.addStep(id, dto, userId);
  }

  @Delete(':id/steps/:stepId')
  @RequirePermissions(PRODUCT_WORKFLOWS_PERMISSIONS.UPDATE)
  removeStep(
    @Param('id') id: string,
    @Param('stepId') stepId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.workflowsService.removeStep(id, stepId, userId);
  }

  @Patch(':id/activate')
  @RequirePermissions(PRODUCT_WORKFLOWS_PERMISSIONS.UPDATE)
  activate(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.workflowsService.activate(id, userId);
  }

  @Patch(':id/deactivate')
  @RequirePermissions(PRODUCT_WORKFLOWS_PERMISSIONS.UPDATE)
  deactivate(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.workflowsService.deactivate(id, userId);
  }

  @Delete(':id')
  @RequirePermissions(PRODUCT_WORKFLOWS_PERMISSIONS.DELETE)
  delete(@Param('id') id: string) {
    return this.workflowsService.delete(id);
  }
}
