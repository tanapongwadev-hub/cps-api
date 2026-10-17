import { createHash } from 'node:crypto';
import type { PermissionAccessScope } from '../../entities/iam/permission.entity';
import { isPermissionOpenToDepartment } from '../access-control/permission-access';

export interface PermissionAccessState {
  id: string;
  code: string;
  menuId: string;
  actionCode: string;
  isActive: boolean;
  accessScope: PermissionAccessScope;
  departmentIds: string[];
}

/**
 * Content hash of every permission's department scope. The bulk save compares
 * it under an advisory lock so two admins cannot overwrite each other.
 */
export function computePermissionAccessVersion(
  permissions: ReadonlyArray<
    Pick<PermissionAccessState, 'id' | 'accessScope' | 'departmentIds'>
  >,
): string {
  const canonical = [...permissions]
    .sort((a, b) => Number(a.id) - Number(b.id))
    .map(
      (permission) =>
        `${permission.id}:${permission.accessScope}:${[...permission.departmentIds]
          .sort((a, b) => Number(a) - Number(b))
          .join(',')}`,
    )
    .join('|');
  return `sha256:${createHash('sha256').update(canonical).digest('hex')}`;
}

export interface ReadDependencyViolation {
  menuId: string;
  departmentId: string;
  permissionCodes: string[];
  readPermissionCode: string;
}

/**
 * A department that may use any non-READ action of a menu must also be able to
 * READ it; otherwise the menu appears in its sidebar but the page answers 403.
 * Menus without their own READ permission are skipped.
 */
export function findReadDependencyViolations(
  permissions: readonly PermissionAccessState[],
  menuIds: Iterable<string>,
  departmentIds: readonly string[],
): ReadDependencyViolation[] {
  const violations: ReadDependencyViolation[] = [];
  for (const menuId of new Set(menuIds)) {
    const menuPermissions = permissions.filter(
      (permission) => permission.menuId === menuId && permission.isActive,
    );
    const read = menuPermissions.find(
      (permission) => permission.actionCode === 'READ',
    );
    if (!read) continue;
    const others = menuPermissions.filter((permission) => permission !== read);
    for (const departmentId of departmentIds) {
      if (
        isPermissionOpenToDepartment(
          read.accessScope,
          read.departmentIds,
          departmentId,
        )
      ) {
        continue;
      }
      const opened = others.filter((permission) =>
        isPermissionOpenToDepartment(
          permission.accessScope,
          permission.departmentIds,
          departmentId,
        ),
      );
      if (opened.length > 0) {
        violations.push({
          menuId,
          departmentId,
          permissionCodes: opened.map((permission) => permission.code).sort(),
          readPermissionCode: read.code,
        });
      }
    }
  }
  return violations;
}
