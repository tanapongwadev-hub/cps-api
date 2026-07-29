import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccessControlService } from './access-control.service';
import { EffectivePermissionService } from './services/effective-permission.service';
import { MenuTreeService } from './services/menu-tree.service';
import { Permission } from '../../entities/iam/permission.entity';
import { RoleAction } from '../../entities/iam/role-action.entity';
import { UserDepartmentRole } from '../../entities/iam/user-department-role.entity';
import { UserDepartmentPermission } from '../../entities/iam/user-department-permission.entity';
import { Menu } from '../../entities/iam/menu.entity';
import { DepartmentPermission } from '../../entities/iam/department-permission.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Permission,
      RoleAction,
      UserDepartmentRole,
      UserDepartmentPermission,
      DepartmentPermission,
      Menu,
    ]),
  ],
  providers: [
    AccessControlService,
    EffectivePermissionService,
    MenuTreeService,
  ],
  exports: [AccessControlService, EffectivePermissionService, MenuTreeService],
})
export class AccessControlModule {}
