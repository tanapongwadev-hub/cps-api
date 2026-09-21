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
import { CreateProcessLineDto } from './dto/create-process-line.dto';
import { ListProcessLinesQueryDto } from './dto/list-process-lines-query.dto';
import { UpdateProcessLineDto } from './dto/update-process-line.dto';
import { PROCESS_LINE_PERMISSIONS } from './process-line-permissions';
import { ProcessLinesService } from './process-lines.service';

@Controller('process-lines')
@UseGuards(JwtAuthGuard, ActiveAssignmentGuard, PermissionGuard)
export class ProcessLinesController {
  constructor(private readonly processLinesService: ProcessLinesService) {}

  @Get()
  @RequirePermissions(PROCESS_LINE_PERMISSIONS.VIEW)
  findAll(@Query() query: ListProcessLinesQueryDto) {
    return this.processLinesService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions(PROCESS_LINE_PERMISSIONS.VIEW)
  findOne(@Param('id') id: string) {
    return this.processLinesService.findOne(id);
  }

  @Post()
  @RequirePermissions(PROCESS_LINE_PERMISSIONS.CREATE)
  create(@Body() dto: CreateProcessLineDto, @CurrentUser('id') userId: string) {
    return this.processLinesService.create(dto, userId);
  }

  @Patch(':id')
  @RequirePermissions(PROCESS_LINE_PERMISSIONS.UPDATE)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProcessLineDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.processLinesService.update(id, dto, userId);
  }

  @Delete(':id')
  @RequirePermissions(PROCESS_LINE_PERMISSIONS.DELETE)
  deactivate(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.processLinesService.deactivate(id, userId);
  }

  @Patch(':id/restore')
  @RequirePermissions(PROCESS_LINE_PERMISSIONS.UPDATE)
  restore(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.processLinesService.restore(id, userId);
  }
}
