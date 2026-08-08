import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';
import { Role } from '../../entities/iam/role.entity';
import { RoleAction } from '../../entities/iam/role-action.entity';
import { Action } from '../../entities/iam/action.entity';
import { UserDepartmentRole } from '../../entities/iam/user-department-role.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Role, RoleAction, Action, UserDepartmentRole]),
  ],
  controllers: [RolesController],
  providers: [RolesService],
  exports: [RolesService],
})
export class RolesModule {}
