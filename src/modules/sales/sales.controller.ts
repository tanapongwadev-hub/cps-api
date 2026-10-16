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
import {
  CancelSalesOrderDto,
  CreateSalesOrderDto,
  IssueSalesJobOrderDto,
  ListSalesJobOrdersQueryDto,
  ListSalesOrdersQueryDto,
  PickSalesJobOrderDto,
  SalesReportQueryDto,
  UpdateSalesOrderDto,
  VersionDto,
} from './dto/sales.dto';
import { SALES_PERMISSIONS as P } from './sales-permissions';
import { SalesService } from './sales.service';

@Controller('sales-orders')
@UseGuards(JwtAuthGuard, ActiveAssignmentGuard, PermissionGuard)
export class SalesOrdersController {
  constructor(private readonly service: SalesService) {}

  @Get()
  @RequirePermissions(P.ORDER_VIEW)
  list(@Query() query: ListSalesOrdersQueryDto) {
    return this.service.listOrders(query);
  }

  @Get('lookups')
  @RequirePermissions(P.ORDER_VIEW)
  lookups() {
    return this.service.lookups();
  }

  @Get(':id')
  @RequirePermissions(P.ORDER_VIEW)
  findOne(@Param('id') id: string) {
    return this.service.findOrder(id);
  }

  @Post()
  @RequirePermissions(P.ORDER_CREATE)
  create(@Body() dto: CreateSalesOrderDto, @CurrentUser('id') userId: string) {
    return this.service.createOrder(dto, userId);
  }

  @Patch(':id')
  @RequirePermissions(P.ORDER_UPDATE)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSalesOrderDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.updateOrder(id, dto, userId);
  }

  @Delete(':id')
  @RequirePermissions(P.ORDER_DELETE)
  remove(
    @Param('id') id: string,
    @Query('version') version: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.deleteOrder(id, Number(version), userId);
  }

  @Post(':id/confirm')
  @RequirePermissions(P.ORDER_CONFIRM)
  confirm(
    @Param('id') id: string,
    @Body() dto: VersionDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.confirmOrder(id, dto.version, userId);
  }

  @Post(':id/cancel')
  @RequirePermissions(P.ORDER_CANCEL)
  cancel(
    @Param('id') id: string,
    @Body() dto: CancelSalesOrderDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.cancelOrder(id, dto, userId);
  }
}

@Controller('sales-job-orders')
@UseGuards(JwtAuthGuard, ActiveAssignmentGuard, PermissionGuard)
export class SalesJobOrdersController {
  constructor(private readonly service: SalesService) {}

  @Get()
  @RequirePermissions(P.JOB_VIEW)
  list(@Query() query: ListSalesJobOrdersQueryDto) {
    return this.service.listJobOrders(query);
  }

  @Get(':id')
  @RequirePermissions(P.JOB_VIEW)
  findOne(@Param('id') id: string) {
    return this.service.findJobOrder(id);
  }

  @Post(':id/print')
  @RequirePermissions(P.JOB_PRINT)
  print(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.printJobOrder(id, userId);
  }

  @Post(':id/pick')
  @RequirePermissions(P.JOB_PICK)
  pick(
    @Param('id') id: string,
    @Body() dto: PickSalesJobOrderDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.pick(id, dto, userId);
  }

  @Post(':id/issue')
  @RequirePermissions(P.JOB_ISSUE)
  issue(
    @Param('id') id: string,
    @Body() dto: IssueSalesJobOrderDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.issue(id, dto, userId);
  }
}

@Controller('sales-reports')
@UseGuards(JwtAuthGuard, ActiveAssignmentGuard, PermissionGuard)
export class SalesReportsController {
  constructor(private readonly service: SalesService) {}

  @Get()
  @RequirePermissions(P.REPORT_VIEW)
  report(@Query() query: SalesReportQueryDto) {
    return this.service.report(query);
  }
}
