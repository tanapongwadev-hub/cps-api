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
import { CreateProcessStepDto } from './dto/create-process-step.dto';
import { ListProcessStepsQueryDto } from './dto/list-process-steps-query.dto';
import { UpdateProcessStepDto } from './dto/update-process-step.dto';
import { PROCESS_STEP_PERMISSIONS } from './process-step-permissions';
import { ProcessStepsService } from './process-steps.service';

@Controller('process-steps')
@UseGuards(JwtAuthGuard, ActiveAssignmentGuard, PermissionGuard)
export class ProcessStepsController {
  constructor(private readonly processStepsService: ProcessStepsService) {}

  @Get()
  @RequirePermissions(PROCESS_STEP_PERMISSIONS.VIEW)
  findAll(@Query() query: ListProcessStepsQueryDto) {
    return this.processStepsService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions(PROCESS_STEP_PERMISSIONS.VIEW)
  findOne(@Param('id') id: string) {
    return this.processStepsService.findOne(id);
  }

  @Post()
  @RequirePermissions(PROCESS_STEP_PERMISSIONS.CREATE)
  create(@Body() dto: CreateProcessStepDto, @CurrentUser('id') userId: string) {
    return this.processStepsService.create(dto, userId);
  }

  @Patch(':id')
  @RequirePermissions(PROCESS_STEP_PERMISSIONS.UPDATE)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProcessStepDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.processStepsService.update(id, dto, userId);
  }

  @Delete(':id')
  @RequirePermissions(PROCESS_STEP_PERMISSIONS.DELETE)
  deactivate(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.processStepsService.deactivate(id, userId);
  }

  @Patch(':id/restore')
  @RequirePermissions(PROCESS_STEP_PERMISSIONS.UPDATE)
  restore(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.processStepsService.restore(id, userId);
  }
}
