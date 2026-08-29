import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireAnyPermissions } from '../../common/decorators/require-any-permissions.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { ActiveAssignmentGuard } from '../../common/guards/active-assignment.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { CreateProductDto } from './dto/create-product.dto';
import { ListProductsQueryDto } from './dto/list-products-query.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import type { ProductImageFile } from './product-image-storage.service';
import { PRODUCTS_PERMISSIONS } from './products-permissions';
import {
  PRODUCT_IMAGE_MAX_SIZE,
  ProductImageStorageService,
} from './product-image-storage.service';
import { ProductsService } from './products.service';

@Controller('products')
@UseGuards(JwtAuthGuard, ActiveAssignmentGuard, PermissionGuard)
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly imageStorage: ProductImageStorageService,
  ) {}

  @Get()
  @RequirePermissions(PRODUCTS_PERMISSIONS.VIEW)
  findAll(@Query() query: ListProductsQueryDto) {
    return this.productsService.findAll(query);
  }

  @Get('lookups')
  @RequirePermissions(PRODUCTS_PERMISSIONS.VIEW)
  getLookups() {
    return this.productsService.getLookups();
  }

  @Post('images')
  @RequireAnyPermissions(
    PRODUCTS_PERMISSIONS.CREATE,
    PRODUCTS_PERMISSIONS.UPDATE,
  )
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: PRODUCT_IMAGE_MAX_SIZE },
    }),
  )
  stageImage(@UploadedFile() file: ProductImageFile) {
    return this.imageStorage.stage(file);
  }

  @Get(':id')
  @RequirePermissions(PRODUCTS_PERMISSIONS.VIEW)
  findOne(@Param('id') id: string) {
    return this.productsService.findOne(id);
  }

  @Post()
  @RequirePermissions(PRODUCTS_PERMISSIONS.CREATE)
  create(@Body() dto: CreateProductDto, @CurrentUser('id') userId: string) {
    return this.productsService.create(dto, userId);
  }

  @Patch(':id')
  @RequirePermissions(PRODUCTS_PERMISSIONS.UPDATE)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.productsService.update(id, dto, userId);
  }

  @Delete(':id')
  @RequirePermissions(PRODUCTS_PERMISSIONS.DELETE)
  deactivate(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.productsService.deactivate(id, userId);
  }

  @Patch(':id/restore')
  @RequirePermissions(PRODUCTS_PERMISSIONS.RESTORE)
  restore(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.productsService.restore(id, userId);
  }
}
