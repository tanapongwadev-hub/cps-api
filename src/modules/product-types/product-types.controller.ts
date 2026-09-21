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
import { CreateProductTypeDto } from './dto/create-product-type.dto';
import { ListProductTypesQueryDto } from './dto/list-product-types-query.dto';
import { UpdateProductTypeDto } from './dto/update-product-type.dto';
import { PRODUCT_TYPE_PERMISSIONS } from './product-type-permissions';
import { ProductTypesService } from './product-types.service';

@Controller('product-types')
@UseGuards(JwtAuthGuard, ActiveAssignmentGuard, PermissionGuard)
export class ProductTypesController {
  constructor(private readonly productTypesService: ProductTypesService) {}

  @Get()
  @RequirePermissions(PRODUCT_TYPE_PERMISSIONS.VIEW)
  findAll(@Query() query: ListProductTypesQueryDto) {
    return this.productTypesService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions(PRODUCT_TYPE_PERMISSIONS.VIEW)
  findOne(@Param('id') id: string) {
    return this.productTypesService.findOne(id);
  }

  @Post()
  @RequirePermissions(PRODUCT_TYPE_PERMISSIONS.CREATE)
  create(@Body() dto: CreateProductTypeDto, @CurrentUser('id') userId: string) {
    return this.productTypesService.create(dto, userId);
  }

  @Patch(':id')
  @RequirePermissions(PRODUCT_TYPE_PERMISSIONS.UPDATE)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProductTypeDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.productTypesService.update(id, dto, userId);
  }

  @Delete(':id')
  @RequirePermissions(PRODUCT_TYPE_PERMISSIONS.DELETE)
  deactivate(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.productTypesService.deactivate(id, userId);
  }

  @Patch(':id/restore')
  @RequirePermissions(PRODUCT_TYPE_PERMISSIONS.UPDATE)
  restore(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.productTypesService.restore(id, userId);
  }
}
