import { EffectivePermissionService } from './effective-permission.service';

describe('EffectivePermissionService', () => {
  it('merges role permissions, applies direct overrides, and removes duplicates', async () => {
    const service = new EffectivePermissionService({
      getEffectivePermissionRows: jest.fn().mockResolvedValue([
        { code: 'user.view', source: 'ROLE', effect: 'ALLOW' },
        { code: 'user.view', source: 'ROLE', effect: 'ALLOW' },
        { code: 'user.create', source: 'ROLE', effect: 'ALLOW' },
        { code: 'user.create', source: 'USER', effect: 'DENY' },
        { code: 'user.update', source: 'USER', effect: 'ALLOW' },
      ]),
    } as any);

    await expect(service.getEffectivePermissionCodes('1')).resolves.toEqual([
      'user.update',
      'user.view',
    ]);
  });

  it('returns every active permission for a super admin', async () => {
    const service = new EffectivePermissionService({
      getAllActivePermissionCodes: jest
        .fn()
        .mockResolvedValue(['user.view', 'menu.view']),
    } as any);

    await expect(
      service.getEffectivePermissionCodes('1', undefined, true),
    ).resolves.toEqual(['menu.view', 'user.view']);
  });

  it('applies deny inside one assignment without blocking another assignment', async () => {
    const service = new EffectivePermissionService({
      getEffectivePermissionRows: jest.fn().mockResolvedValue([
        {
          assignmentId: 'a',
          departmentId: '1',
          code: 'order.approve',
          source: 'ROLE',
          effect: 'ALLOW',
        },
        {
          assignmentId: 'a',
          departmentId: '1',
          code: 'order.approve',
          source: 'USER',
          effect: 'DENY',
        },
        {
          assignmentId: 'b',
          departmentId: '2',
          code: 'order.approve',
          source: 'ROLE',
          effect: 'ALLOW',
        },
      ]),
    } as any);

    await expect(
      service.getEffectivePermissionCodes('u1'),
    ).resolves.toEqual(['order.approve']);
  });

  it('removes a permission denied inside its only matching assignment', async () => {
    const service = new EffectivePermissionService({
      getEffectivePermissionRows: jest.fn().mockResolvedValue([
        {
          assignmentId: 'a',
          departmentId: '1',
          code: 'order.approve',
          source: 'ROLE',
          effect: 'ALLOW',
        },
        {
          assignmentId: 'a',
          departmentId: '1',
          code: 'order.approve',
          source: 'USER',
          effect: 'DENY',
        },
      ]),
    } as any);

    await expect(
      service.getEffectivePermissionCodes('u1'),
    ).resolves.toEqual([]);
  });
});
