import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRE_ANY_PERMISSIONS_KEY } from '../decorators/require-any-permissions.decorator';
import { REQUIRE_PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { RoleCode } from '../enums/role-code.enum';
import { CurrentUserWithAssignment } from '../interfaces/current-user.interface';
import { EffectivePermissionService } from '../../modules/access-control/services/effective-permission.service';
import { PermissionGuard } from './permission.guard';

describe('PermissionGuard', () => {
  type GuardUser = Pick<CurrentUserWithAssignment, 'id' | 'activeRoleCode'> &
    Partial<CurrentUserWithAssignment>;

  const context = (user: GuardUser | undefined) =>
    ({
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => ({ user, path: '/users' }) }),
    }) as unknown as ExecutionContext;

  const permissionService = (permissions: string[] = []) => {
    const getEffectivePermissionCodes: jest.MockedFunction<
      EffectivePermissionService['getEffectivePermissionCodes']
    > = jest.fn();
    getEffectivePermissionCodes.mockResolvedValue(permissions);
    return { getEffectivePermissionCodes };
  };

  const reflectorMetadata = (metadata: { all?: string[]; any?: string[] }) =>
    ({
      getAllAndOverride: jest.fn((key: string) => {
        if (key === REQUIRE_PERMISSIONS_KEY) return metadata.all;
        if (key === REQUIRE_ANY_PERMISSIONS_KEY) return metadata.any;
        return undefined;
      }),
    }) as unknown as Reflector;

  it('allows a user with every required permission', async () => {
    const reflector = reflectorMetadata({
      all: ['user.create', 'user.view'],
    });
    const service = permissionService(['user.create', 'user.view']);
    const guard = new PermissionGuard(
      reflector,
      service as unknown as EffectivePermissionService,
    );

    await expect(
      guard.canActivate(
        context({
          id: '1',
          activeRoleCode: RoleCode.USER,
          activeUserDepartmentRoleId: '2',
        }),
      ),
    ).resolves.toBe(true);
    expect(service.getEffectivePermissionCodes).toHaveBeenCalledWith(
      '1',
      '2',
      false,
    );
  });

  it('denies a permission granted only by a different active assignment', async () => {
    const reflector = reflectorMetadata({ all: ['material.delete'] });
    const service = permissionService();
    service.getEffectivePermissionCodes.mockImplementation(
      (_userId, assignmentId) =>
        Promise.resolve(
          assignmentId === 'selected-assignment'
            ? ['material.view']
            : ['material.delete'],
        ),
    );
    const guard = new PermissionGuard(
      reflector,
      service as unknown as EffectivePermissionService,
    );

    await expect(
      guard.canActivate(
        context({
          id: '1',
          activeRoleCode: RoleCode.USER,
          activeUserDepartmentRoleId: 'selected-assignment',
        }),
      ),
    ).rejects.toMatchObject({ response: { code: 'PERMISSION_DENIED' } });
    expect(service.getEffectivePermissionCodes).toHaveBeenCalledWith(
      '1',
      'selected-assignment',
      false,
    );
  });

  it('denies a user without the required permission', async () => {
    const reflector = reflectorMetadata({ all: ['user.delete'] });
    const service = permissionService(['user.view']);
    const guard = new PermissionGuard(
      reflector,
      service as unknown as EffectivePermissionService,
    );

    await expect(
      guard.canActivate(
        context({
          id: '1',
          activeRoleCode: RoleCode.USER,
          activeUserDepartmentRoleId: '2',
        }),
      ),
    ).rejects.toMatchObject({ response: { code: 'PERMISSION_DENIED' } });
  });

  it('preserves all-permissions semantics when one required permission is missing', async () => {
    const reflector = reflectorMetadata({
      all: ['material.create', 'material.update'],
    });
    const service = permissionService(['material.create']);
    const guard = new PermissionGuard(
      reflector,
      service as unknown as EffectivePermissionService,
    );

    await expect(
      guard.canActivate(context({ id: '1', activeRoleCode: RoleCode.USER })),
    ).rejects.toMatchObject({ response: { code: 'PERMISSION_DENIED' } });
  });

  it('allows any-permission metadata when at least one permission is granted', async () => {
    const reflector = reflectorMetadata({
      any: ['material.create', 'material.update'],
    });
    const service = permissionService(['material.update']);
    const guard = new PermissionGuard(
      reflector,
      service as unknown as EffectivePermissionService,
    );

    await expect(
      guard.canActivate(context({ id: '1', activeRoleCode: RoleCode.USER })),
    ).resolves.toBe(true);
  });

  it('denies any-permission metadata when none are granted', async () => {
    const reflector = reflectorMetadata({
      any: ['material.create', 'material.update'],
    });
    const service = permissionService(['material.view']);
    const guard = new PermissionGuard(
      reflector,
      service as unknown as EffectivePermissionService,
    );

    await expect(
      guard.canActivate(context({ id: '1', activeRoleCode: RoleCode.USER })),
    ).rejects.toMatchObject({ response: { code: 'PERMISSION_DENIED' } });
  });

  it('bypasses effective permission lookup for a super admin', async () => {
    const reflector = reflectorMetadata({ any: ['user.delete'] });
    const service = permissionService();
    const guard = new PermissionGuard(
      reflector,
      service as unknown as EffectivePermissionService,
    );

    await expect(
      guard.canActivate(
        context({ id: '1', activeRoleCode: RoleCode.SUPER_ADMIN }),
      ),
    ).resolves.toBe(true);
    expect(service.getEffectivePermissionCodes).not.toHaveBeenCalled();
  });
});
