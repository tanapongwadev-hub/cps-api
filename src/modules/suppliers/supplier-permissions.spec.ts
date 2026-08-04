import { SUPPLIER_PERMISSIONS } from './supplier-permissions';

describe('SUPPLIER_PERMISSIONS', () => {
  it('exposes the four CRUD permission codes', () => {
    expect(SUPPLIER_PERMISSIONS).toEqual({
      VIEW: 'SUPPLIER_VIEW',
      CREATE: 'SUPPLIER_CREATE',
      UPDATE: 'SUPPLIER_UPDATE',
      DELETE: 'SUPPLIER_DELETE',
    });
  });
});
