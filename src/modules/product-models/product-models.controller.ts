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
import { CreateProductModelDto } from './dto/create-product-model.dto';
import { ListProductModelsQueryDto } from './dto/list-product-models-query.dto';
import { UpdateProductModelDto } from './dto/update-product-model.dto';
import { PRODUCT_MODEL_PERMISSIONS } from './product-model-permissions';
import { ProductModelsService } from './product-models.service';

@Controller('product-models')
@UseGuards(JwtAuthGuard, ActiveAssignmentGuard, PermissionGuard)
export class ProductModelsController {
  constructor(private readonly productModelsService: ProductModelsService) {}

  @Get()
  @RequirePermissions(PRODUCT_MODEL_PERMISSIONS.VIEW)
  findAll(@Query() query: ListProductModelsQueryDto) {
    return this.productModelsService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions(PRODUCT_MODEL_PERMISSIONS.VIEW)
  findOne(@Param('id') id: string) {
    return this.productModelsService.findOne(id);
  }

  @Post()
  @RequirePermissions(PRODUCT_MODEL_PERMISSIONS.CREATE)
  create(
    @Body() dto: CreateProductModelDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.productModelsService.create(dto, userId);
  }

  @Patch(':id')
  @RequirePermissions(PRODUCT_MODEL_PERMISSIONS.UPDATE)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProductModelDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.productModelsService.update(id, dto, userId);
  }

  @Delete(':id')
  @RequirePermissions(PRODUCT_MODEL_PERMISSIONS.DELETE)
  deactivate(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.productModelsService.deactivate(id, userId);
  }

  @Patch(':id/restore')
  @RequirePermissions(PRODUCT_MODEL_PERMISSIONS.UPDATE)
  restore(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.productModelsService.restore(id, userId);
  }
}
