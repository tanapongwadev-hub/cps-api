import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PermissionsController } from './permissions.controller';
import { PermissionsService } from './permissions.service';
import { Permission } from '../../entities/iam/permission.entity';
import { Menu } from '../../entities/iam/menu.entity';
import { Action } from '../../entities/iam/action.entity';
import { Department } from '../../entities/iam/department.entity';
import { DepartmentPermission } from '../../entities/iam/department-permission.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Permission,
      Menu,
      Action,
      Department,
      DepartmentPermission,
    ]),
  ],
  controllers: [PermissionsController],
  providers: [PermissionsService],
  exports: [PermissionsService],
})
export class PermissionsModule {}
