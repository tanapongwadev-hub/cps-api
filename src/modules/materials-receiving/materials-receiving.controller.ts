import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { ActiveAssignmentGuard } from '../../common/guards/active-assignment.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { CancelMaterialsReceivingDto } from './dto/cancel-materials-receiving.dto';
import { CreateMaterialsReceivingDto } from './dto/create-materials-receiving.dto';
import { ListMaterialsReceivingQueryDto } from './dto/list-materials-receiving-query.dto';
import { UpdateMaterialsReceivingDto } from './dto/update-materials-receiving.dto';
import { MATERIALS_RECEIVING_PERMISSIONS } from './materials-receiving-permissions';
import { MaterialsReceivingService } from './materials-receiving.service';

@Controller('materials-receiving')
@UseGuards(JwtAuthGuard, ActiveAssignmentGuard, PermissionGuard)
export class MaterialsReceivingController {
  constructor(
    private readonly materialsReceivingService: MaterialsReceivingService,
  ) {}

  @Get()
  @RequirePermissions(MATERIALS_RECEIVING_PERMISSIONS.VIEW)
  findAll(@Query() query: ListMaterialsReceivingQueryDto) {
    return this.materialsReceivingService.findAll(query);
  }

  @Get('lookups')
  @RequirePermissions(MATERIALS_RECEIVING_PERMISSIONS.VIEW)
  getLookups() {
    return this.materialsReceivingService.getMaterialLookups();
  }

  @Get('suppliers')
  @RequirePermissions(MATERIALS_RECEIVING_PERMISSIONS.VIEW)
  getSuppliersByMaterial(@Query('materialId') materialId: string) {
    if (!materialId) {
      throw new BadRequestException('materialId query param is required');
    }
    return this.materialsReceivingService.getSuppliersByMaterial(materialId);
  }

  @Get('by-lot/:internalLotNo')
  @RequirePermissions(MATERIALS_RECEIVING_PERMISSIONS.VIEW)
  async findByInternalLotNo(@Param('internalLotNo') internalLotNo: string) {
    const receiving =
      await this.materialsReceivingService.findByInternalLotNo(internalLotNo);
    if (!receiving) {
      throw new NotFoundException('Material receiving not found');
    }
    return this.materialsReceivingService.findOne(receiving.id);
  }

  @Get(':id')
  @RequirePermissions(MATERIALS_RECEIVING_PERMISSIONS.VIEW)
  findOne(@Param('id') id: string) {
    return this.materialsReceivingService.findOne(id);
  }

  @Post()
  @RequirePermissions(MATERIALS_RECEIVING_PERMISSIONS.CREATE)
  create(
    @Body() dto: CreateMaterialsReceivingDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.materialsReceivingService.create(dto, userId);
  }

  @Patch(':id')
  @RequirePermissions(MATERIALS_RECEIVING_PERMISSIONS.UPDATE)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateMaterialsReceivingDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.materialsReceivingService.update(id, dto, userId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(MATERIALS_RECEIVING_PERMISSIONS.DELETE)
  remove(@Param('id') id: string) {
    return this.materialsReceivingService.remove(id);
  }

  @Post(':id/confirm')
  @RequirePermissions(MATERIALS_RECEIVING_PERMISSIONS.CONFIRM)
  confirm(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.materialsReceivingService.confirm(id, userId);
  }

  @Post(':id/cancel')
  @RequirePermissions(MATERIALS_RECEIVING_PERMISSIONS.CANCEL)
  cancel(
    @Param('id') id: string,
    @Body() dto: CancelMaterialsReceivingDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.materialsReceivingService.cancel(id, dto, userId);
  }

  @Get('packages/:packageId/qr')
  @RequirePermissions(MATERIALS_RECEIVING_PERMISSIONS.VIEW)
  async getPackageQr(@Param('packageId') packageId: string, @Res() res: Response) {
    const base64 = await this.materialsReceivingService.getPackageQrCode(packageId);
    if (!base64) {
      throw new NotFoundException('QR code not found');
    }
    // base64 format: "data:image/png;base64,iVBORw0..."
    const matches = base64.match(/^data:image\/png;base64,(.+)$/);
    if (!matches) {
      throw new NotFoundException('Invalid QR code format');
    }
    const buffer = Buffer.from(matches[1], 'base64');
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `inline; filename="qr-${packageId}.png"`);
    res.send(buffer);
  }
}
