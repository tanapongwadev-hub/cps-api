import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
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
import { CancelMaterialsDisbursementDto } from './dto/cancel-materials-disbursement.dto';
import { CreateMaterialsDisbursementDto } from './dto/create-materials-disbursement.dto';
import { ListMaterialsDisbursementQueryDto } from './dto/list-materials-disbursement-query.dto';
import { ReportMaterialsDisbursementQueryDto } from './dto/report-materials-disbursement.dto';
import { UpdateMaterialsDisbursementDto } from './dto/update-materials-disbursement.dto';
import { MATERIALS_DISBURSEMENT_PERMISSIONS } from './materials-disbursement-permissions';
import { MaterialsDisbursementService } from './materials-disbursement.service';

@Controller('materials-disbursement')
@UseGuards(JwtAuthGuard, ActiveAssignmentGuard, PermissionGuard)
export class MaterialsDisbursementController {
  constructor(
    private readonly disbursementService: MaterialsDisbursementService,
  ) {}

  @Get()
  @RequirePermissions(MATERIALS_DISBURSEMENT_PERMISSIONS.VIEW)
  findAll(@Query() query: ListMaterialsDisbursementQueryDto) {
    return this.disbursementService.findAll(query);
  }

  /** รายงานจ่ายออกวัสดุเพื่อสอบกลับ */
  @Get('report')
  @RequirePermissions(MATERIALS_DISBURSEMENT_PERMISSIONS.VIEW)
  generateReport(@Query() query: ReportMaterialsDisbursementQueryDto) {
    return this.disbursementService.generateReport(query);
  }

  @Get('lookups')
  @RequirePermissions(MATERIALS_DISBURSEMENT_PERMISSIONS.VIEW)
  getLookups() {
    return this.disbursementService.getLookups();
  }

  @Get(':id')
  @RequirePermissions(MATERIALS_DISBURSEMENT_PERMISSIONS.VIEW)
  findOne(@Param('id') id: string) {
    return this.disbursementService.findOne(id);
  }

  @Post()
  @RequirePermissions(MATERIALS_DISBURSEMENT_PERMISSIONS.CREATE)
  create(
    @Body() dto: CreateMaterialsDisbursementDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.disbursementService.create(dto, userId);
  }

  @Patch(':id')
  @RequirePermissions(MATERIALS_DISBURSEMENT_PERMISSIONS.UPDATE)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateMaterialsDisbursementDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.disbursementService.update(id, dto, userId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(MATERIALS_DISBURSEMENT_PERMISSIONS.DELETE)
  remove(@Param('id') id: string) {
    return this.disbursementService.remove(id);
  }

  @Post(':id/confirm')
  @RequirePermissions(MATERIALS_DISBURSEMENT_PERMISSIONS.CONFIRM)
  confirm(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.disbursementService.confirm(id, userId);
  }

  @Post(':id/cancel')
  @RequirePermissions(MATERIALS_DISBURSEMENT_PERMISSIONS.CANCEL)
  cancel(
    @Param('id') id: string,
    @Body() dto: CancelMaterialsDisbursementDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.disbursementService.cancel(id, dto, userId);
  }
}
