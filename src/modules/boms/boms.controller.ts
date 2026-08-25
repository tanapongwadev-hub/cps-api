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
import { BOMS_PERMISSIONS } from './boms-permissions';
import { BomsService } from './boms.service';
import { CreateBomDto } from './dto/create-bom.dto';
import { UpdateBomDto } from './dto/update-bom.dto';
import { AddBomItemDto } from './dto/update-bom.dto';

@Controller('boms')
@UseGuards(JwtAuthGuard, ActiveAssignmentGuard, PermissionGuard)
export class BomsController {
  constructor(private readonly bomsService: BomsService) {}

  @Get('product/:productId')
  @RequirePermissions(BOMS_PERMISSIONS.VIEW)
  findByProduct(@Param('productId') productId: string) {
    return this.bomsService.findByProduct(productId);
  }

  @Get(':id')
  @RequirePermissions(BOMS_PERMISSIONS.VIEW)
  findOne(@Param('id') id: string) {
    return this.bomsService.findOne(id);
  }

  @Post()
  @RequirePermissions(BOMS_PERMISSIONS.CREATE)
  create(@Body() dto: CreateBomDto, @CurrentUser('id') userId: string) {
    return this.bomsService.create(dto, userId);
  }

  @Patch(':id')
  @RequirePermissions(BOMS_PERMISSIONS.UPDATE)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateBomDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.bomsService.update(id, dto, userId);
  }

  @Post(':id/items')
  @RequirePermissions(BOMS_PERMISSIONS.UPDATE)
  addItem(
    @Param('id') id: string,
    @Body() dto: AddBomItemDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.bomsService.addItem(id, dto, userId);
  }

  @Delete(':id/items/:itemId')
  @RequirePermissions(BOMS_PERMISSIONS.UPDATE)
  removeItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.bomsService.removeItem(id, itemId, userId);
  }

  @Patch(':id/activate')
  @RequirePermissions(BOMS_PERMISSIONS.UPDATE)
  activate(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.bomsService.activate(id, userId);
  }

  @Patch(':id/deactivate')
  @RequirePermissions(BOMS_PERMISSIONS.UPDATE)
  deactivate(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.bomsService.deactivate(id, userId);
  }

  @Delete(':id')
  @RequirePermissions(BOMS_PERMISSIONS.DELETE)
  delete(@Param('id') id: string) {
    return this.bomsService.delete(id);
  }
}
