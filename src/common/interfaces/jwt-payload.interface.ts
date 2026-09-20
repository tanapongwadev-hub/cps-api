import { RoleCode } from '../enums/role-code.enum';

export interface JwtPayload {
  sub: string;
  sessionId: string;
  userDepartmentRoleId: string | null;
  departmentId: string | null;
  roleCode: RoleCode | null;
  permissionVersion: number;
}
