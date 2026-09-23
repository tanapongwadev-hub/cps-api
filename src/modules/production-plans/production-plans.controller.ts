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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { ActiveAssignmentGuard } from '../../common/guards/active-assignment.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { CancelProductionPlanDto } from './dto/cancel-production-plan.dto';
import { CreateProductionPlanDto } from './dto/create-production-plan.dto';
import { ImportProductionPlanDto } from './dto/import-production-plan.dto';
import { ListProductionPlansQueryDto } from './dto/list-production-plans-query.dto';
import { UpdateProductionPlanDto } from './dto/update-production-plan.dto';
import { PRODUCTION_PLAN_PERMISSIONS } from './production-plan-permissions';
import type { ProductionPlanImportFile } from './production-plans.service';
import { ProductionPlansService } from './production-plans.service';

const PRODUCTION_PLAN_IMPORT_MAX_SIZE = 10 * 1024 * 1024;

@Controller('production-plans')
@UseGuards(JwtAuthGuard, ActiveAssignmentGuard, PermissionGuard)
export class ProductionPlansController {
  constructor(private readonly service: ProductionPlansService) {}

  @Get()
  @RequirePermissions(PRODUCTION_PLAN_PERMISSIONS.VIEW)
  findAll(@Query() query: ListProductionPlansQueryDto) {
    return this.service.findAll(query);
  }

  @Get('lookups')
  @RequirePermissions(PRODUCTION_PLAN_PERMISSIONS.VIEW)
  getLookups() {
    return this.service.getLookups();
  }

  @Post('import')
  @RequirePermissions(PRODUCTION_PLAN_PERMISSIONS.CREATE)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: PRODUCTION_PLAN_IMPORT_MAX_SIZE },
    }),
  )
  importExcel(
    @UploadedFile() file: ProductionPlanImportFile,
    @Body() dto: ImportProductionPlanDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.importExcel(file, dto, userId);
  }

  @Get(':id')
  @RequirePermissions(PRODUCTION_PLAN_PERMISSIONS.VIEW)
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @RequirePermissions(PRODUCTION_PLAN_PERMISSIONS.CREATE)
  create(
    @Body() dto: CreateProductionPlanDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.create(dto, userId);
  }

  @Patch(':id')
  @RequirePermissions(PRODUCTION_PLAN_PERMISSIONS.UPDATE)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProductionPlanDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.update(id, dto, userId);
  }

  @Post(':id/approve')
  @RequirePermissions(PRODUCTION_PLAN_PERMISSIONS.APPROVE)
  approve(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.approve(id, userId);
  }

  @Post(':id/issue')
  @RequirePermissions(PRODUCTION_PLAN_PERMISSIONS.ISSUE)
  issue(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.issue(id, userId);
  }

  @Post(':id/cancel')
  @RequirePermissions(PRODUCTION_PLAN_PERMISSIONS.CANCEL)
  cancel(
    @Param('id') id: string,
    @Body() dto: CancelProductionPlanDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.cancel(id, dto, userId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PRODUCTION_PLAN_PERMISSIONS.DELETE)
  remove(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.remove(id, userId);
  }
}
