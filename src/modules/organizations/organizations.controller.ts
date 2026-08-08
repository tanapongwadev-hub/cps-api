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
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { ListOrganizationsQueryDto } from './dto/list-organizations-query.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { ORGANIZATION_PERMISSIONS } from './organization-permissions';
import { OrganizationsService } from './organizations.service';

@Controller('organizations')
@UseGuards(JwtAuthGuard, ActiveAssignmentGuard, PermissionGuard)
export class OrganizationsController {
  constructor(private readonly service: OrganizationsService) {}

  @Get() @RequirePermissions(ORGANIZATION_PERMISSIONS.VIEW) findAll(
    @Query() q: ListOrganizationsQueryDto,
  ) {
    return this.service.findAll(q);
  }
  @Get(':id') @RequirePermissions(ORGANIZATION_PERMISSIONS.VIEW) findOne(
    @Param('id') id: string,
  ) {
    return this.service.findOne(id);
  }
  @Post() @RequirePermissions(ORGANIZATION_PERMISSIONS.CREATE) create(
    @Body() dto: CreateOrganizationDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.create(dto, userId);
  }
  @Patch(':id') @RequirePermissions(ORGANIZATION_PERMISSIONS.UPDATE) update(
    @Param('id') id: string,
    @Body() dto: UpdateOrganizationDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.update(id, dto, userId);
  }
  @Delete(':id')
  @RequirePermissions(ORGANIZATION_PERMISSIONS.DELETE)
  deactivate(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.deactivate(id, userId);
  }
  @Patch(':id/restore')
  @RequirePermissions(ORGANIZATION_PERMISSIONS.UPDATE)
  restore(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.restore(id, userId);
  }
}
