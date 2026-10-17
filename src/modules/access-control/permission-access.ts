import type { PermissionAccessScope } from '../../entities/iam/permission.entity';

/**
 * Whether a permission's department scope lets an assignment in
 * `departmentId` use it. ALL ignores department mappings; DEPARTMENTS allows
 * only the listed departments, and an empty list allows nobody. An assignment
 * without a department (SUPER_ADMIN style) only passes ALL.
 */
export function isPermissionOpenToDepartment(
  accessScope: PermissionAccessScope | null | undefined,
  activeDepartmentIds: readonly string[],
  departmentId: string | null,
): boolean {
  if ((accessScope ?? 'ALL') === 'ALL') return true;
  return departmentId !== null && activeDepartmentIds.includes(departmentId);
}
