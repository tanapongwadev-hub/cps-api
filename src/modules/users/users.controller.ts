import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RoleCode } from '../../common/enums/role-code.enum';
import { CreateUserDto, CreateAssignmentDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { UpdateAssignmentDto } from './dto/update-assignment.dto';
import { UserAccessSummaryService } from './user-access-summary.service';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleCode.SUPER_ADMIN)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly userAccessSummaryService: UserAccessSummaryService,
  ) {}

  @Get()
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    return this.usersService.findAll(
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 20,
      search,
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Post()
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(id, updateUserDto);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() updateStatusDto: UpdateStatusDto,
  ) {
    return this.usersService.updateStatus(id, updateStatusDto);
  }

  @Post(':id/reset-password')
  resetPassword(
    @Param('id') id: string,
    @Body('newPassword') newPassword: string,
  ) {
    return this.usersService.resetPassword(id, newPassword);
  }

  @Get(':id/access-summary')
  getAccessSummary(@Param('id') id: string) {
    return this.userAccessSummaryService.getForUser(id);
  }

  @Get(':id/assignments')
  getAssignments(@Param('id') id: string) {
    return this.usersService.getAssignments(id);
  }

  @Post(':id/assignments')
  createAssignment(
    @Param('id') id: string,
    @Body() assignmentDto: CreateAssignmentDto,
  ) {
    return this.usersService.createAssignment(id, assignmentDto);
  }

  @Patch(':id/assignments/:assignmentId')
  updateAssignment(
    @Param('id') id: string,
    @Param('assignmentId') assignmentId: string,
    @Body() updateAssignmentDto: UpdateAssignmentDto,
  ) {
    return this.usersService.updateAssignment(
      id,
      assignmentId,
      updateAssignmentDto,
    );
  }

  @Delete(':id/assignments/:assignmentId')
  removeAssignment(
    @Param('id') id: string,
    @Param('assignmentId') assignmentId: string,
  ) {
    return this.usersService.removeAssignment(id, assignmentId);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }
}
