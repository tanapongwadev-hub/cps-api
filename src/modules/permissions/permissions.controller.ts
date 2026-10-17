import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PermissionsService } from './permissions.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RoleCode } from '../../common/enums/role-code.enum';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';
import { UpdatePermissionDepartmentsDto } from './dto/update-permission-departments.dto';
import { UpdatePermissionAccessDto } from './dto/update-permission-access.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('permissions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleCode.SUPER_ADMIN)
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Get()
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    return this.permissionsService.findAll(
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 20,
      search,
    );
  }

  /** Department scope matrix for the permission management screen. */
  @Get('matrix')
  getMatrix() {
    return this.permissionsService.getMatrix();
  }

  /** Bulk save of department scopes, guarded by the matrix version. */
  @Put('access')
  updateAccess(
    @Body() updatePermissionAccessDto: UpdatePermissionAccessDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.permissionsService.updateAccess(
      updatePermissionAccessDto,
      userId ?? null,
    );
  }

  @Get('options')
  getOptions() {
    return this.permissionsService.getOptions();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.permissionsService.findOne(id);
  }

  @Put(':id/departments')
  updateDepartments(
    @Param('id') id: string,
    @Body() updatePermissionDepartmentsDto: UpdatePermissionDepartmentsDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.permissionsService.updateDepartments(
      id,
      updatePermissionDepartmentsDto.departmentIds,
      userId ?? null,
    );
  }

  @Post()
  create(@Body() createPermissionDto: CreatePermissionDto) {
    return this.permissionsService.create(createPermissionDto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updatePermissionDto: UpdatePermissionDto,
  ) {
    return this.permissionsService.update(id, updatePermissionDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.permissionsService.remove(id);
  }
}
