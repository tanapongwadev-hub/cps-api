import { Repository } from 'typeorm';
import { Menu } from '../../entities/iam/menu.entity';
import { Permission } from '../../entities/iam/permission.entity';
import { RoleAction } from '../../entities/iam/role-action.entity';
import { UserDepartmentPermission } from '../../entities/iam/user-department-permission.entity';
import { UserDepartmentRole } from '../../entities/iam/user-department-role.entity';
import { AccessControlService } from './access-control.service';

type RepositoryStub<T extends object> = Partial<
  Record<keyof Repository<T>, jest.Mock>
>;

function repositoryStub<T extends object>(): RepositoryStub<T> {
  return {
    find: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
}

describe('AccessControlService department restrictions', () => {
  let permissions: RepositoryStub<Permission>;
  let roleActions: RepositoryStub<RoleAction>;
  let assignments: RepositoryStub<UserDepartmentRole>;
  let directPermissions: RepositoryStub<UserDepartmentPermission>;
  let menus: RepositoryStub<Menu>;
  let service: AccessControlService;

  const assignmentA = {
    id: 'a',
    userId: 'u1',
    roleId: 'r1',
    departmentId: '1',
    isActive: true,
    expiredAt: null,
  } as UserDepartmentRole;
  const assignmentB = {
    id: 'b',
    userId: 'u1',
    roleId: 'r2',
    departmentId: '2',
    isActive: true,
    expiredAt: null,
  } as UserDepartmentRole;

  beforeEach(() => {
    permissions = repositoryStub<Permission>();
    roleActions = repositoryStub<RoleAction>();
    assignments = repositoryStub<UserDepartmentRole>();
    directPermissions = repositoryStub<UserDepartmentPermission>();
    menus = repositoryStub<Menu>();
    service = new AccessControlService(
      permissions as unknown as Repository<Permission>,
      roleActions as unknown as Repository<RoleAction>,
      assignments as unknown as Repository<UserDepartmentRole>,
      directPermissions as unknown as Repository<UserDepartmentPermission>,
      menus as unknown as Repository<Menu>,
    );

    assignments.find!.mockResolvedValue([assignmentA, assignmentB]);
    assignments.createQueryBuilder!.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([assignmentA, assignmentB]),
    });
    directPermissions.find!.mockResolvedValue([]);
  });

  it('does not combine a role grant with a matching department from another assignment', async () => {
    roleActions.find!.mockResolvedValue([
      { roleId: 'r1', actionId: 'approve', isActive: true },
    ]);
    permissions.find!.mockResolvedValue([
      {
        id: 'p1',
        actionId: 'approve',
        code: 'order.approve',
        isActive: true,
        accessScope: 'DEPARTMENTS',
        departmentPermissions: [{ departmentId: '2', isActive: true }],
      },
    ]);

    await expect(service.getEffectivePermissionRows('u1')).resolves.toEqual([]);
  });

  it('emits the grant with the identity of the matching assignment', async () => {
    roleActions.find!.mockResolvedValue([
      { roleId: 'r2', actionId: 'approve', isActive: true },
    ]);
    permissions.find!.mockResolvedValue([
      {
        id: 'p1',
        actionId: 'approve',
        code: 'order.approve',
        isActive: true,
        accessScope: 'DEPARTMENTS',
        departmentPermissions: [{ departmentId: '2', isActive: true }],
      },
    ]);

    await expect(service.getEffectivePermissionRows('u1')).resolves.toEqual([
      {
        assignmentId: 'b',
        departmentId: '2',
        code: 'order.approve',
        effect: 'ALLOW',
        source: 'ROLE',
      },
    ]);
  });

  it('ignores department mappings on an ALL scope', async () => {
    roleActions.find!.mockResolvedValue([
      { roleId: 'r1', actionId: 'approve', isActive: true },
    ]);
    permissions.find!.mockResolvedValue([
      {
        id: 'p1',
        actionId: 'approve',
        code: 'order.approve',
        isActive: true,
        accessScope: 'ALL',
        departmentPermissions: [{ departmentId: '2', isActive: true }],
      },
    ]);

    await expect(
      service.getEffectivePermissionRows('u1'),
    ).resolves.toContainEqual(
      expect.objectContaining({
        assignmentId: 'a',
        departmentId: '1',
        code: 'order.approve',
      }),
    );
  });

  it('closes a DEPARTMENTS permission with no active mapping to everybody', async () => {
    roleActions.find!.mockResolvedValue([
      { roleId: 'r1', actionId: 'approve', isActive: true },
      { roleId: 'r2', actionId: 'approve', isActive: true },
    ]);
    permissions.find!.mockResolvedValue([
      {
        id: 'p1',
        actionId: 'approve',
        code: 'order.approve',
        isActive: true,
        accessScope: 'DEPARTMENTS',
        departmentPermissions: [{ departmentId: '1', isActive: false }],
      },
    ]);

    await expect(service.getEffectivePermissionRows('u1')).resolves.toEqual([]);
  });

  describe('user overrides', () => {
    const closedToDepartmentOne = {
      id: 'p1',
      code: 'menu_b.view',
      isActive: true,
      accessScope: 'DEPARTMENTS',
      departmentPermissions: [{ departmentId: '2', isActive: true }],
    };

    beforeEach(() => {
      roleActions.find!.mockResolvedValue([]);
      permissions.find!.mockResolvedValue([]);
    });

    it('lets an ALLOW override grant a menu the department does not have', async () => {
      directPermissions.find!.mockResolvedValue([
        {
          userDepartmentRoleId: 'a',
          effect: 'ALLOW',
          isActive: true,
          expiresAt: null,
          permission: closedToDepartmentOne,
        },
      ]);

      await expect(service.getEffectivePermissionRows('u1')).resolves.toEqual([
        {
          assignmentId: 'a',
          departmentId: '1',
          code: 'menu_b.view',
          effect: 'ALLOW',
          source: 'USER',
        },
      ]);
    });

    it('ignores an expired override', async () => {
      directPermissions.find!.mockResolvedValue([
        {
          userDepartmentRoleId: 'a',
          effect: 'ALLOW',
          isActive: true,
          expiresAt: new Date(Date.now() - 60_000),
          permission: closedToDepartmentOne,
        },
      ]);

      await expect(service.getEffectivePermissionRows('u1')).resolves.toEqual([]);
    });

    it('ignores an override on an inactive permission', async () => {
      directPermissions.find!.mockResolvedValue([
        {
          userDepartmentRoleId: 'a',
          effect: 'ALLOW',
          isActive: true,
          expiresAt: null,
          permission: { ...closedToDepartmentOne, isActive: false },
        },
      ]);

      await expect(service.getEffectivePermissionRows('u1')).resolves.toEqual([]);
    });
  });
});
