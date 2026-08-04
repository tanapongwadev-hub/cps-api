import { STATUS_ITEM_PERMISSIONS } from './status-item-permissions';

describe('STATUS_ITEM_PERMISSIONS', () => {
  it('exposes the four CRUD permission codes', () => {
    expect(STATUS_ITEM_PERMISSIONS).toEqual({
      VIEW: 'STATUS_ITEM_VIEW',
      CREATE: 'STATUS_ITEM_CREATE',
      UPDATE: 'STATUS_ITEM_UPDATE',
      DELETE: 'STATUS_ITEM_DELETE',
    });
  });
});
