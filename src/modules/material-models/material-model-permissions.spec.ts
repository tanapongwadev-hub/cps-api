import { MATERIAL_MODEL_PERMISSIONS } from './material-model-permissions';

describe('MATERIAL_MODEL_PERMISSIONS', () => {
  it('exposes the four CRUD permission codes', () => {
    expect(MATERIAL_MODEL_PERMISSIONS).toEqual({
      VIEW: 'MATERIAL_MODEL_VIEW',
      CREATE: 'MATERIAL_MODEL_CREATE',
      UPDATE: 'MATERIAL_MODEL_UPDATE',
      DELETE: 'MATERIAL_MODEL_DELETE',
    });
  });
});
