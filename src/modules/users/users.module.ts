import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { User } from '../../entities/iam/user.entity';
import { UserDepartmentRole } from '../../entities/iam/user-department-role.entity';
import { UserDepartmentPermission } from '../../entities/iam/user-department-permission.entity';
import { AccessControlModule } from '../access-control/access-control.module';
import { UserAccessSummaryService } from './user-access-summary.service';

@Module({
  imports: [
    AccessControlModule,
    TypeOrmModule.forFeature([
      User,
      UserDepartmentRole,
      UserDepartmentPermission,
    ]),
  ],
  controllers: [UsersController],
  providers: [UsersService, UserAccessSummaryService],
  exports: [UsersService, UserAccessSummaryService],
})
export class UsersModule {}
