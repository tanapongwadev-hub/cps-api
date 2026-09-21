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
import { CreateCustomerDto } from './dto/create-customer.dto';
import { ListCustomersQueryDto } from './dto/list-customers-query.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CUSTOMER_PERMISSIONS } from './customer-permissions';
import { CustomersService } from './customers.service';

@Controller('customers')
@UseGuards(JwtAuthGuard, ActiveAssignmentGuard, PermissionGuard)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  @RequirePermissions(CUSTOMER_PERMISSIONS.VIEW)
  findAll(@Query() query: ListCustomersQueryDto) {
    return this.customersService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions(CUSTOMER_PERMISSIONS.VIEW)
  findOne(@Param('id') id: string) {
    return this.customersService.findOne(id);
  }

  @Post()
  @RequirePermissions(CUSTOMER_PERMISSIONS.CREATE)
  create(@Body() dto: CreateCustomerDto, @CurrentUser('id') userId: string) {
    return this.customersService.create(dto, userId);
  }

  @Patch(':id')
  @RequirePermissions(CUSTOMER_PERMISSIONS.UPDATE)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCustomerDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.customersService.update(id, dto, userId);
  }

  @Delete(':id')
  @RequirePermissions(CUSTOMER_PERMISSIONS.DELETE)
  deactivate(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.customersService.deactivate(id, userId);
  }

  @Patch(':id/restore')
  @RequirePermissions(CUSTOMER_PERMISSIONS.UPDATE)
  restore(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.customersService.restore(id, userId);
  }
}
