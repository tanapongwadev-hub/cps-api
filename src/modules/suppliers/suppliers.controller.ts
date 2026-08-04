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
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { ListSuppliersQueryDto } from './dto/list-suppliers-query.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { SUPPLIER_PERMISSIONS } from './supplier-permissions';
import { SuppliersService } from './suppliers.service';

@Controller('suppliers')
@UseGuards(JwtAuthGuard, ActiveAssignmentGuard, PermissionGuard)
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Get()
  @RequirePermissions(SUPPLIER_PERMISSIONS.VIEW)
  findAll(@Query() query: ListSuppliersQueryDto) {
    return this.suppliersService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions(SUPPLIER_PERMISSIONS.VIEW)
  findOne(@Param('id') id: string) {
    return this.suppliersService.findOne(id);
  }

  @Post()
  @RequirePermissions(SUPPLIER_PERMISSIONS.CREATE)
  create(@Body() dto: CreateSupplierDto, @CurrentUser('id') userId: string) {
    return this.suppliersService.create(dto, userId);
  }

  @Patch(':id')
  @RequirePermissions(SUPPLIER_PERMISSIONS.UPDATE)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSupplierDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.suppliersService.update(id, dto, userId);
  }

  @Delete(':id')
  @RequirePermissions(SUPPLIER_PERMISSIONS.DELETE)
  deactivate(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.suppliersService.deactivate(id, userId);
  }

  @Patch(':id/restore')
  @RequirePermissions(SUPPLIER_PERMISSIONS.UPDATE)
  restore(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.suppliersService.restore(id, userId);
  }
}
