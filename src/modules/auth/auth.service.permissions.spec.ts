import { RoleCode } from '../../common/enums/role-code.enum';
import { AuthService } from './auth.service';

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
});
