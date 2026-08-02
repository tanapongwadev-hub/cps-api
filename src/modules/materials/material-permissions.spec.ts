import { MATERIAL_PERMISSIONS } from './material-permissions';

describe('MATERIAL_PERMISSIONS', () => {
  it('exposes the material CRUD permission codes used by authorization', () => {
    expect(MATERIAL_PERMISSIONS).toEqual({
      VIEW: 'MATERIAL_VIEW',
      CREATE: 'MATERIAL_CREATE',
      UPDATE: 'MATERIAL_UPDATE',
      DELETE: 'MATERIAL_DELETE',
    });
  });
});
