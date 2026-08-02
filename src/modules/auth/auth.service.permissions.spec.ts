import { RoleCode } from '../../common/enums/role-code.enum';
import { User } from '../../entities/iam/user.entity';
import { UserDepartmentRole } from '../../entities/iam/user-department-role.entity';
import { AuthService } from './auth.service';

type AuthenticationResponseHarness = {
  effectivePermissionService: {
    getEffectivePermissionCodes: jest.Mock;
  };
  userDepartmentRoleRepository: { createQueryBuilder: jest.Mock };
  accessControlService: { getMenusWithPermissions: jest.Mock };
  menuTreeService: { buildMenuTree: jest.Mock };
  configService: { get: jest.Mock };
  buildAuthenticationResponse: (
    user: User,
    assignment: UserDepartmentRole | null,
    accessToken: string,
    refreshToken: string,
  ) => Promise<{
    data: {
      currentDepartmentRole?: Record<string, unknown>;
      accessControl: Record<string, unknown>;
    };
  }>;
};

function createAuthenticationResponseHarness(
  assignments: UserDepartmentRole[],
): AuthenticationResponseHarness {
  const queryBuilder = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(assignments),
  };
  const service = Object.create(
    AuthService.prototype,
  ) as AuthenticationResponseHarness;
  service.effectivePermissionService = {
    getEffectivePermissionCodes: jest.fn().mockResolvedValue(['ticket.read']),
  };
  service.userDepartmentRoleRepository = {
    createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
  };
  service.accessControlService = {
    getMenusWithPermissions: jest.fn().mockResolvedValue([]),
  };
  service.menuTreeService = { buildMenuTree: jest.fn().mockReturnValue([]) };
  service.configService = { get: jest.fn().mockReturnValue('8h') };
  return service;
}

describe('AuthService permission details', () => {
  it('loads permission details from the same effective codes used by guards', async () => {
    const permission = {
      id: '10',
      code: 'order.approve',
      isActive: true,
    };
    const service = Object.create(AuthService.prototype) as AuthService & {
      effectivePermissionService: {
        getEffectivePermissionCodes: jest.Mock;
      };
      permissionRepository: { find: jest.Mock };
    };
    service.effectivePermissionService = {
      getEffectivePermissionCodes: jest
        .fn()
        .mockResolvedValue(['order.approve']),
    };
    service.permissionRepository = {
      find: jest.fn().mockResolvedValue([permission]),
    };

    await expect(
      service.getMyPermissions('u1', RoleCode.USER),
    ).resolves.toEqual({ permissions: [permission] });
    expect(
      service.effectivePermissionService.getEffectivePermissionCodes,
    ).toHaveBeenCalledWith('u1', undefined, false);
  });

  it('builds authentication for the selected assignment only', async () => {
    const assignment = {
      id: '76',
      userId: '46',
      departmentId: '2',
      roleId: '3',
      isActive: true,
      assignedAt: new Date('2026-01-01T00:00:00.000Z'),
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      department: {
        id: '2',
        code: 'OPS',
        nameTh: 'ฝ่ายปฏิบัติการ',
      },
      role: {
        id: '3',
        code: 'USER',
        nameTh: 'ผู้ใช้งาน',
      },
    } as unknown as UserDepartmentRole;
    const user = {
      id: '46',
      username: 'page.render',
      firstName: 'Page',
      lastName: 'Render',
      email: 'page.render@test.local',
    } as User;
    const service = createAuthenticationResponseHarness([assignment]);

    const response = await service.buildAuthenticationResponse(
      user,
      assignment,
      'access-token',
      'refresh-token',
    );

    expect(
      service.effectivePermissionService.getEffectivePermissionCodes,
    ).toHaveBeenCalledWith('46', '76', false);
    expect(response.data.currentDepartmentRole).toMatchObject({
      id: '76',
      userId: '46',
      departmentId: '2',
      departmentCode: 'OPS',
      roleId: '3',
      roleCode: 'USER',
    });
    expect(response.data.accessControl).toMatchObject({
      userDepartmentRoleId: '76',
      departmentId: '2',
      roleId: '3',
    });
  });

  it('hydrates auth me from the assignment selected in the JWT context', async () => {
    const user = {
      id: '53',
      username: 'user-we-ps',
    } as User;
    const pcAssignment = {
      id: '92',
      userId: '53',
      departmentId: '6',
      roleId: '3',
      isActive: true,
      department: { id: '6', code: 'PC', nameTh: 'แผนก PC' },
      role: { id: '3', code: 'USER', nameTh: 'ผู้ใช้งาน' },
    } as unknown as UserDepartmentRole;
    const response = {
      data: {
        authentication: { refreshToken: 'refresh-token' },
        currentDepartmentRole: { id: '92', departmentId: '6' },
        accessControl: { userDepartmentRoleId: '92', menus: [] },
      },
    };
    const service = Object.create(AuthService.prototype) as AuthService & {
      userRepository: { findOne: jest.Mock };
      userDepartmentRoleRepository: { findOne: jest.Mock };
      buildAuthenticationResponse: jest.Mock;
    };
    service.userRepository = { findOne: jest.fn().mockResolvedValue(user) };
    service.userDepartmentRoleRepository = {
      findOne: jest.fn().mockResolvedValue(pcAssignment),
    };
    service.buildAuthenticationResponse = jest.fn().mockResolvedValue(response);

    await expect(service.getMe('53', '92')).resolves.toMatchObject({
      data: {
        currentDepartmentRole: { id: '92', departmentId: '6' },
        accessControl: { userDepartmentRoleId: '92' },
      },
    });
    expect(service.userDepartmentRoleRepository.findOne).toHaveBeenCalledWith({
      where: { id: '92', userId: '53', isActive: true },
      relations: ['department', 'role'],
    });
    expect(service.buildAuthenticationResponse).toHaveBeenCalledWith(
      user,
      pcAssignment,
      '',
      '',
    );
  });
});
