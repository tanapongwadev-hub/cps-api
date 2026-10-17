import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuditLog } from '../../entities/iam/audit-log.entity';
import { Permission } from '../../entities/iam/permission.entity';
import { Role } from '../../entities/iam/role.entity';
import { UserDepartmentPermission } from '../../entities/iam/user-department-permission.entity';
import { UserDepartmentRole } from '../../entities/iam/user-department-role.entity';
import { UserPermissionOverridesService } from './user-permission-overrides.service';

type Stub = Record<string, jest.Mock>;

function stub(): Stub {
  return {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn(),
    create: jest.fn((value: unknown) => value),
    save: jest.fn(async (value: unknown) => value),
    delete: jest.fn(),
  };
}

describe('UserPermissionOverridesService.replace', () => {
  let assignments: Stub;
  let roles: Stub;
  let permissions: Stub;
  let overrides: Stub;
  let audit: Stub;
  let service: UserPermissionOverridesService;

  const assignment = {
    id: '22',
    userId: '7',
    departmentId: '1',
    roleId: '3',
  } as UserDepartmentRole;

  beforeEach(() => {
    assignments = stub();
    roles = stub();
    permissions = stub();
    overrides = stub();
    audit = stub();
    const manager = {
      getRepository: (entity: unknown) => {
        if (entity === UserDepartmentRole) return assignments;
        if (entity === Role) return roles;
        if (entity === Permission) return permissions;
        if (entity === UserDepartmentPermission) return overrides;
        if (entity === AuditLog) return audit;
        throw new Error('unexpected repository');
      },
    };
    const dataSource = {
      manager,
      transaction: jest.fn(async (callback: (m: unknown) => unknown) =>
        callback(manager),
      ),
    };
    service = new UserPermissionOverridesService(
      dataSource as unknown as DataSource,
    );
    assignments.findOne.mockResolvedValue(assignment);
    roles.findOne.mockResolvedValue({ id: '3', code: 'USER' });
    permissions.find.mockResolvedValue([
      { id: '100', code: 'MENU_B_VIEW', isActive: true },
      { id: '101', code: 'MENU_A_VIEW', isActive: true },
    ]);
  });

  it('stores ALLOW and DENY overrides and audits the change', async () => {
    const result = await service.replace(
      '7',
      '22',
      {
        reason: 'ให้ดูเมนู B ข้ามแผนก',
        items: [
          { permissionId: '100', effect: 'ALLOW', expiresAt: null },
          { permissionId: '101', effect: 'DENY' },
        ],
      },
      '9',
    );

    expect(result.changed).toBe(true);
    expect(overrides.delete).toHaveBeenCalledWith({ userDepartmentRoleId: '22' });
    expect(overrides.save).toHaveBeenCalledWith(
      expect.objectContaining({ permissionId: '101', effect: 'DENY', grantedBy: '9' }),
    );
    expect(audit.save).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: 'iam.user_permission.overrides_changed',
        targetType: 'USER_ASSIGNMENT',
        targetId: '22',
        reason: 'ให้ดูเมนู B ข้ามแผนก',
        afterData: {
          userId: '7',
          overrides: [
            { permissionCode: 'MENU_A_VIEW', effect: 'DENY', expiresAt: null },
            { permissionCode: 'MENU_B_VIEW', effect: 'ALLOW', expiresAt: null },
          ],
        },
      }),
    );
  });

  it('refuses SUPER_ADMIN assignments', async () => {
    roles.findOne.mockResolvedValue({ id: '1', code: 'SUPER_ADMIN' });
    await expect(
      service.replace('7', '22', { reason: 'x', items: [] }, '9'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(overrides.delete).not.toHaveBeenCalled();
  });

  it('rejects an expiry in the past and duplicate permissions', async () => {
    await expect(
      service.replace(
        '7',
        '22',
        {
          reason: 'x',
          items: [{ permissionId: '100', effect: 'ALLOW', expiresAt: '2000-01-01T00:00:00Z' }],
        },
        '9',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.replace(
        '7',
        '22',
        {
          reason: 'x',
          items: [
            { permissionId: '100', effect: 'ALLOW' },
            { permissionId: '100', effect: 'DENY' },
          ],
        },
        '9',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('skips writing when the override set is unchanged', async () => {
    overrides.find.mockResolvedValue([
      { permissionId: '100', effect: 'ALLOW', expiresAt: null, permission: { code: 'MENU_B_VIEW' } },
    ]);
    const result = await service.replace(
      '7',
      '22',
      { reason: 'x', items: [{ permissionId: '100', effect: 'ALLOW' }] },
      '9',
    );
    expect(result.changed).toBe(false);
    expect(overrides.delete).not.toHaveBeenCalled();
    expect(audit.save).not.toHaveBeenCalled();
  });
});
