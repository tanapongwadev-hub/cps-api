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
import { CreateRejectReasonDto } from './dto/create-reject-reason.dto';
import { ListRejectReasonsQueryDto } from './dto/list-reject-reasons-query.dto';
import { UpdateRejectReasonDto } from './dto/update-reject-reason.dto';
import { REJECT_REASON_PERMISSIONS } from './reject-reason-permissions';
import { RejectReasonsService } from './reject-reasons.service';

@Controller('reject-reasons')
@UseGuards(JwtAuthGuard, ActiveAssignmentGuard, PermissionGuard)
export class RejectReasonsController {
  constructor(private readonly rejectReasonsService: RejectReasonsService) {}

  @Get()
  @RequirePermissions(REJECT_REASON_PERMISSIONS.VIEW)
  findAll(@Query() query: ListRejectReasonsQueryDto) {
    return this.rejectReasonsService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions(REJECT_REASON_PERMISSIONS.VIEW)
  findOne(@Param('id') id: string) {
    return this.rejectReasonsService.findOne(id);
  }

  @Post()
  @RequirePermissions(REJECT_REASON_PERMISSIONS.CREATE)
  create(
    @Body() dto: CreateRejectReasonDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.rejectReasonsService.create(dto, userId);
  }

  @Patch(':id')
  @RequirePermissions(REJECT_REASON_PERMISSIONS.UPDATE)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateRejectReasonDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.rejectReasonsService.update(id, dto, userId);
  }

  @Delete(':id')
  @RequirePermissions(REJECT_REASON_PERMISSIONS.DELETE)
  deactivate(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.rejectReasonsService.deactivate(id, userId);
  }

  @Patch(':id/restore')
  @RequirePermissions(REJECT_REASON_PERMISSIONS.UPDATE)
  restore(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.rejectReasonsService.restore(id, userId);
  }
}
