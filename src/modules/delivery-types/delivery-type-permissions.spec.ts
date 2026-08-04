import { DELIVERY_TYPE_PERMISSIONS } from './delivery-type-permissions';

describe('DELIVERY_TYPE_PERMISSIONS', () => {
  it('exposes the four CRUD permission codes', () => {
    expect(DELIVERY_TYPE_PERMISSIONS).toEqual({
      VIEW: 'DELIVERY_TYPE_VIEW',
      CREATE: 'DELIVERY_TYPE_CREATE',
      UPDATE: 'DELIVERY_TYPE_UPDATE',
      DELETE: 'DELIVERY_TYPE_DELETE',
    });
  });
});
