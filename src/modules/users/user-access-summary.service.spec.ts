import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { User } from '../../entities/iam/user.entity';
import { UserDepartmentRole } from '../../entities/iam/user-department-role.entity';
import { AccessControlService } from '../access-control/access-control.service';
import { EffectivePermissionService } from '../access-control/services/effective-permission.service';
import {
  MenuResponse,
  MenuTreeService,
} from '../access-control/services/menu-tree.service';
import { UserAccessSummaryService } from './user-access-summary.service';

type AssignmentQueryBuilderStub = {
  leftJoinAndSelect: jest.Mock;
  where: jest.Mock;
  orderBy: jest.Mock;
  addOrderBy: jest.Mock;
  getMany: jest.Mock;
};

describe('UserAccessSummaryService', () => {
  let users: { findOneBy: jest.Mock };
  let assignmentsRepository: { createQueryBuilder: jest.Mock };
  let effectivePermissions: {
    getEffectivePermissionCodes: jest.Mock;
  };
  let accessControl: { getMenusWithPermissions: jest.Mock };
  let menuTree: { buildMenuTree: jest.Mock };
  let assignmentQuery: AssignmentQueryBuilderStub;
  let assignments: UserDepartmentRole[];
  let service: UserAccessSummaryService;

  const menuDefinitions = [
    {
      id: 'menu-production',
      parentId: null,
      code: 'production',
      nameTh: 'การผลิต',
      nameEn: 'Production',
      path: '/production',
      icon: null,
      menuType: 'GROUP',
      sortOrder: 1,
      isActive: true,
      isVisible: true,
      permissions: [],
    },
    {
      id: 'menu-production-jobs',
      parentId: 'menu-production',
      code: 'production.jobs',
      nameTh: 'งานผลิต',
      nameEn: 'Production jobs',
      path: '/production/jobs',
      icon: null,
      menuType: 'ITEM',
      sortOrder: 1,
      isActive: true,
      isVisible: true,
      permissions: ['production.read'],
    },
    {
      id: 'menu-quality',
      parentId: null,
      code: 'quality',
      nameTh: 'คุณภาพ',
      nameEn: 'Quality',
      path: '/quality',
      icon: null,
      menuType: 'ITEM',
      sortOrder: 2,
      isActive: true,
      isVisible: true,
      permissions: ['quality.read'],
    },
  ];

  const productionChild: MenuResponse = {
    id: 'menu-production-jobs',
    code: 'production.jobs',
    name: 'งานผลิต',
    nameEn: 'Production jobs',
    path: '/production/jobs',
    icon: null,
    menuType: 'ITEM',
    sortOrder: 1,
    permissions: ['production.read'],
    children: [],
  };
  const productionMenu: MenuResponse = {
    id: 'menu-production',
    code: 'production',
    name: 'การผลิต',
    nameEn: 'Production',
    path: '/production',
    icon: null,
    menuType: 'GROUP',
    sortOrder: 1,
    permissions: [],
    children: [],
  };
  const qualityMenu: MenuResponse = {
    id: 'menu-quality',
    code: 'quality',
    name: 'คุณภาพ',
    nameEn: 'Quality',
    path: '/quality',
    icon: null,
    menuType: 'ITEM',
    sortOrder: 2,
    permissions: ['quality.read'],
    children: [],
  };
  const baseAssignment: UserDepartmentRole = {
    id: '76',
    userId: '7',
    departmentId: '3',
    roleId: '4',
    isActive: true,
    expiredAt: null,
    department: {
      id: '3',
      code: 'PROD',
      nameTh: 'ฝ่ายผลิต',
    },
    role: {
      id: '4',
      code: 'OPERATOR',
      nameTh: 'พนักงานผลิต',
      scopeType: 'DEPARTMENT',
    },
  } as UserDepartmentRole;

  beforeEach(() => {
    users = { findOneBy: jest.fn().mockResolvedValue({ id: '7' } as User) };
    assignmentsRepository = { createQueryBuilder: jest.fn() };
    effectivePermissions = {
      getEffectivePermissionCodes: jest.fn().mockResolvedValue([]),
    };
    accessControl = {
      getMenusWithPermissions: jest.fn().mockResolvedValue(menuDefinitions),
    };
    menuTree = { buildMenuTree: jest.fn().mockReturnValue([]) };
    assignments = [
      baseAssignment,
      {
        ...baseAssignment,
        id: '77',
        department: { id: '4', code: 'QA', nameTh: 'ฝ่ายคุณภาพ' },
        role: { id: '5', code: 'INSPECTOR', nameTh: 'ผู้ตรวจสอบ', scopeType: 'DEPARTMENT' },
      } as UserDepartmentRole,
    ];
    assignmentQuery = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockImplementation(async () => assignments),
    };
    assignmentsRepository.createQueryBuilder.mockReturnValue(assignmentQuery);
    service = new UserAccessSummaryService(
      users as unknown as Repository<User>,
      assignmentsRepository as unknown as Repository<UserDepartmentRole>,
      effectivePermissions as unknown as EffectivePermissionService,
      accessControl as unknown as AccessControlService,
      menuTree as unknown as MenuTreeService,
    );
  });

  it('builds an independently scoped menu tree for every active assignment', async () => {
    effectivePermissions.getEffectivePermissionCodes
      .mockResolvedValueOnce(['production.read'])
      .mockResolvedValueOnce(['quality.read']);
    menuTree.buildMenuTree
      .mockReturnValueOnce([{ ...productionMenu, children: [productionChild] }])
      .mockReturnValueOnce([qualityMenu]);

    const result = await service.getForUser('7');

    expect(effectivePermissions.getEffectivePermissionCodes).toHaveBeenNthCalledWith(
      1,
      '7',
      '76',
      false,
    );
    expect(effectivePermissions.getEffectivePermissionCodes).toHaveBeenNthCalledWith(
      2,
      '7',
      '77',
      false,
    );
    expect(result.assignments[0]).toMatchObject({
      assignmentId: '76',
      permissions: ['production.read'],
      menuCount: 2,
    });
    expect(result.assignments[1]).toMatchObject({
      assignmentId: '77',
      permissions: ['quality.read'],
      menuCount: 1,
    });
    expect(assignmentQuery.orderBy).toHaveBeenCalledWith('udr.createdAt', 'ASC');
    expect(assignmentQuery.addOrderBy).toHaveBeenCalledWith('udr.id', 'ASC');
    expect(accessControl.getMenusWithPermissions).toHaveBeenCalledTimes(1);
  });

  it('uses Super Admin permission and menu behavior for a SUPER_ADMIN assignment', async () => {
    assignments = [
      {
        ...baseAssignment,
        id: '80',
        departmentId: null,
        department: null,
        role: {
          id: '1',
          code: 'SUPER_ADMIN',
          nameTh: 'ผู้ดูแลระบบ',
          scopeType: 'SYSTEM',
        },
      } as UserDepartmentRole,
    ];
    effectivePermissions.getEffectivePermissionCodes.mockResolvedValue([
      'all.permissions',
    ]);

    await service.getForUser('7');

    expect(effectivePermissions.getEffectivePermissionCodes).toHaveBeenCalledWith(
      '7',
      '80',
      true,
    );
    expect(menuTree.buildMenuTree).toHaveBeenCalledWith(
      menuDefinitions,
      ['all.permissions'],
      true,
    );
  });

  it.each([
    { label: 'inactive', isActive: false, expiredAt: null },
    { label: 'expired', isActive: true, expiredAt: new Date('2026-08-01T00:00:00Z') },
  ])('returns no current access for an $label assignment', async ({ isActive, expiredAt }) => {
    assignments = [{ ...baseAssignment, isActive, expiredAt }];

    const result = await service.getForUser('7');

    expect(result.assignments[0]).toMatchObject({
      permissions: [],
      menus: [],
      menuCount: 0,
    });
    expect(effectivePermissions.getEffectivePermissionCodes).not.toHaveBeenCalled();
    expect(menuTree.buildMenuTree).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when the target user does not exist', async () => {
    users.findOneBy.mockResolvedValue(null);

    await expect(service.getForUser('404')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
