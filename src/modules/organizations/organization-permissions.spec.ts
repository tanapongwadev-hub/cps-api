import { ORGANIZATION_PERMISSIONS } from './organization-permissions';

describe('ORGANIZATION_PERMISSIONS', () => {
  it('exposes the four CRUD permission codes', () => {
    expect(ORGANIZATION_PERMISSIONS).toEqual({
      VIEW: 'ORGANIZATION_VIEW',
      CREATE: 'ORGANIZATION_CREATE',
      UPDATE: 'ORGANIZATION_UPDATE',
      DELETE: 'ORGANIZATION_DELETE',
    });
  });
});
