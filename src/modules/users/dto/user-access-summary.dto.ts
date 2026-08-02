import { MenuResponse } from '../../access-control/services/menu-tree.service';

export interface UserAccessSummaryDepartmentDto {
  id: string;
  code: string;
  name: string;
}

export interface UserAccessSummaryRoleDto {
  id: string;
  code: string;
  name: string;
  scopeType: 'SYSTEM' | 'DEPARTMENT';
}

export interface UserAssignmentAccessDto {
  assignmentId: string;
  department: UserAccessSummaryDepartmentDto | null;
  role: UserAccessSummaryRoleDto;
  isActive: boolean;
  expiredAt: Date | null;
  permissions: string[];
  menus: MenuResponse[];
  menuCount: number;
}

export interface UserAccessSummaryDto {
  userId: string;
  assignments: UserAssignmentAccessDto[];
}
