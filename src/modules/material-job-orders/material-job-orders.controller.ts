import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { ActiveAssignmentGuard } from '../../common/guards/active-assignment.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { IssueMaterialJobOrderDto } from './dto/issue-material-job-order.dto';
import { ListMaterialJobOrdersQueryDto } from './dto/list-material-job-orders-query.dto';
import { PickMaterialJobOrderDto } from './dto/pick-material-job-order.dto';
import { MATERIAL_JOB_ORDER_PERMISSIONS } from './material-job-order-permissions';
import { MaterialJobOrdersService } from './material-job-orders.service';

@Controller('material-job-orders')
@UseGuards(JwtAuthGuard, ActiveAssignmentGuard, PermissionGuard)
export class MaterialJobOrdersController {
  constructor(private readonly service: MaterialJobOrdersService) {}

  @Get()
  @RequirePermissions(MATERIAL_JOB_ORDER_PERMISSIONS.VIEW)
  findAll(@Query() query: ListMaterialJobOrdersQueryDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @RequirePermissions(MATERIAL_JOB_ORDER_PERMISSIONS.VIEW)
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post(':id/print')
  @RequirePermissions(MATERIAL_JOB_ORDER_PERMISSIONS.PRINT)
  print(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.print(id, userId);
  }

  @Post(':id/pick')
  @RequirePermissions(MATERIAL_JOB_ORDER_PERMISSIONS.PICK)
  pick(
    @Param('id') id: string,
    @Body() dto: PickMaterialJobOrderDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.pick(id, dto, userId);
  }

  @Post(':id/issue')
  @RequirePermissions(MATERIAL_JOB_ORDER_PERMISSIONS.ISSUE)
  issue(
    @Param('id') id: string,
    @Body() dto: IssueMaterialJobOrderDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.issue(id, dto, userId);
  }
}
