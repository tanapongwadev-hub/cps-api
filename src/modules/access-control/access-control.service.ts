import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Permission } from '../../entities/iam/permission.entity';
import { RoleAction } from '../../entities/iam/role-action.entity';
import { UserDepartmentRole } from '../../entities/iam/user-department-role.entity';
import { UserDepartmentPermission } from '../../entities/iam/user-department-permission.entity';
import { Menu } from '../../entities/iam/menu.entity';

export interface EffectivePermissionRow {
  assignmentId: string;
  departmentId: string | null;
  code: string;
  effect: 'ALLOW' | 'DENY';
  source: 'ROLE' | 'USER';
}

@Injectable()
export class AccessControlService {
  constructor(
    @InjectRepository(Permission)
    private readonly permissionRepository: Repository<Permission>,
    @InjectRepository(RoleAction)
    private readonly roleActionRepository: Repository<RoleAction>,
    @InjectRepository(UserDepartmentRole)
    private readonly assignmentRepository: Repository<UserDepartmentRole>,
    @InjectRepository(UserDepartmentPermission)
    private readonly directPermissionRepository: Repository<UserDepartmentPermission>,
    @InjectRepository(Menu)
    private readonly menuRepository: Repository<Menu>,
  ) {}

  async getAllActivePermissionCodes(): Promise<string[]> {
    const permissions = await this.permissionRepository.find({
      where: { isActive: true },
      select: ['code'],
    });
    return permissions.map((permission) => permission.code);
  }

  async getEffectivePermissionRows(
    userId: string,
    assignmentId?: string,
  ): Promise<EffectivePermissionRow[]> {
    const assignmentQuery = this.assignmentRepository
      .createQueryBuilder('assignment')
      .where('assignment.userId = :userId', { userId })
      .andWhere('assignment.isActive = true')
      .andWhere(
        '(assignment.expiredAt IS NULL OR assignment.expiredAt > :now)',
        { now: new Date() },
      );
    if (assignmentId) {
      assignmentQuery.andWhere('assignment.id = :assignmentId', {
        assignmentId,
      });
    }
    const assignments = await assignmentQuery.getMany();
    const roleIds = assignments.map((assignment) => assignment.roleId);
    const roleActions = roleIds.length
      ? await this.roleActionRepository.find({
          where: roleIds.map((roleId) => ({ roleId, isActive: true })),
          relations: ['action'],
        })
      : [];
    const actionIds = [
      ...new Set(roleActions.map((roleAction) => roleAction.actionId)),
    ];
    const rolePermissions = actionIds.length
      ? await this.permissionRepository.find({
          where: actionIds.map((actionId) => ({ actionId, isActive: true })),
          relations: ['action', 'departmentPermissions'],
        })
      : [];
    const direct = assignments.length
      ? await this.directPermissionRepository.find({
          where: assignments.map((assignment) => ({
            userDepartmentRoleId: assignment.id,
            isActive: true,
          })),
          relations: ['permission', 'permission.departmentPermissions'],
        })
      : [];

    const actionIdsByRole = new Map<string, Set<string>>();
    for (const roleAction of roleActions) {
      const ids = actionIdsByRole.get(roleAction.roleId) ?? new Set<string>();
      ids.add(roleAction.actionId);
      actionIdsByRole.set(roleAction.roleId, ids);
    }
    const directByAssignment = new Map<string, UserDepartmentPermission[]>();
    for (const entry of direct) {
      const entries = directByAssignment.get(entry.userDepartmentRoleId) ?? [];
      entries.push(entry);
      directByAssignment.set(entry.userDepartmentRoleId, entries);
    }

    const rows: EffectivePermissionRow[] = [];
    for (const assignment of assignments) {
      const grantedActionIds =
        actionIdsByRole.get(assignment.roleId) ?? new Set<string>();

      for (const permission of rolePermissions) {
        if (!grantedActionIds.has(permission.actionId)) continue;
        if (!this.isAllowedInDepartment(permission, assignment.departmentId)) {
          continue;
        }
        rows.push({
          assignmentId: assignment.id,
          departmentId: assignment.departmentId,
          code: permission.code,
          effect: 'ALLOW',
          source: 'ROLE',
        });
      }

      for (const entry of directByAssignment.get(assignment.id) ?? []) {
        if (!entry.permission?.isActive) continue;
        if (
          !this.isAllowedInDepartment(entry.permission, assignment.departmentId)
        ) {
          continue;
        }
        rows.push({
          assignmentId: assignment.id,
          departmentId: assignment.departmentId,
          code: entry.permission.code,
          effect: entry.effect ?? 'ALLOW',
          source: 'USER',
        });
      }
    }

    return rows;
  }

  private isAllowedInDepartment(
    permission: Permission,
    departmentId: string | null,
  ): boolean {
    const restrictedIds = (permission.departmentPermissions ?? [])
      .filter((mapping) => mapping.isActive)
      .map((mapping) => mapping.departmentId);

    return (
      restrictedIds.length === 0 ||
      (departmentId !== null && restrictedIds.includes(departmentId))
    );
  }

  async getMenusWithPermissions(): Promise<
    Array<Menu & { permissions: string[] }>
  > {
    const [menus, permissions] = await Promise.all([
      this.menuRepository.find({
        where: { isActive: true, isVisible: true },
        order: { sortOrder: 'ASC', createdAt: 'ASC' },
      }),
      this.permissionRepository.find({
        where: { isActive: true },
        relations: ['menu'],
      }),
    ]);
    const permissionMap = new Map<string, string[]>();
    for (const permission of permissions) {
      const codes = permissionMap.get(permission.menuId) ?? [];
      codes.push(permission.code);
      permissionMap.set(permission.menuId, codes);
    }
    return menus.map((menu) => ({
      ...menu,
      permissions: [...new Set(permissionMap.get(menu.id) ?? [])],
    }));
  }
}
