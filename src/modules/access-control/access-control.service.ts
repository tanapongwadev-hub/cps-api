import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Permission } from '../../entities/iam/permission.entity';
import { RoleAction } from '../../entities/iam/role-action.entity';
import { UserDepartmentRole } from '../../entities/iam/user-department-role.entity';
import { UserDepartmentPermission } from '../../entities/iam/user-department-permission.entity';
import { Menu } from '../../entities/iam/menu.entity';
import { isPermissionOpenToDepartment } from './permission-access';

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
    const now = new Date();
    const assignmentQuery = this.assignmentRepository
      .createQueryBuilder('assignment')
      .where('assignment.userId = :userId', { userId })
      .andWhere('assignment.isActive = true')
      .andWhere(
        '(assignment.expiredAt IS NULL OR assignment.expiredAt > :now)',
        { now },
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
          relations: ['permission'],
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
        // A user override is a deliberate per-person exception: ALLOW may grant
        // a permission the assignment's department does not have, and DENY
        // always wins. Only expired overrides are ignored.
        if (!entry.permission?.isActive) continue;
        if (entry.expiresAt && new Date(entry.expiresAt) <= now) continue;
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
    const activeDepartmentIds = (permission.departmentPermissions ?? [])
      .filter((mapping) => mapping.isActive)
      .map((mapping) => mapping.departmentId);

    return isPermissionOpenToDepartment(
      permission.accessScope,
      activeDepartmentIds,
      departmentId,
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
