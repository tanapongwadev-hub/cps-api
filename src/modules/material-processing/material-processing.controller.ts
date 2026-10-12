import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { ActiveAssignmentGuard } from '../../common/guards/active-assignment.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { CreateMaterialProcessingDto, ListMaterialProcessingDto } from './material-processing.dto';
import { MaterialProcessingService } from './material-processing.service';

@Controller('material-processing')
@UseGuards(JwtAuthGuard, ActiveAssignmentGuard, PermissionGuard)
export class MaterialProcessingController {
  constructor(private readonly service: MaterialProcessingService) {}

  @Get()
  @RequirePermissions('MATERIAL_PROCESSING_VIEW')
  list(@Query() query: ListMaterialProcessingDto) { return this.service.list(query); }

  @Get('lookups')
  @RequirePermissions('MATERIAL_PROCESSING_VIEW')
  lookups() { return this.service.lookups(); }

  @Get('receivings/:id/history')
  @RequirePermissions('MATERIAL_PROCESSING_VIEW')
  history(@Param('id') id: string) { return this.service.history(id); }

  @Get('outputs/:id')
  @RequirePermissions('MATERIAL_PROCESSING_VIEW')
  output(@Param('id') id: string) { return this.service.output(id); }

  @Post()
  @RequirePermissions('MATERIAL_PROCESSING_CREATE')
  process(@Body() dto: CreateMaterialProcessingDto, @CurrentUser('id') userId: string) {
    return this.service.process(dto, userId);
  }
}
