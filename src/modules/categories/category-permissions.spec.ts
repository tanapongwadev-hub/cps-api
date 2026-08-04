import { CATEGORY_PERMISSIONS } from './category-permissions';

describe('CATEGORY_PERMISSIONS', () => {
  it('exposes the four CRUD permission codes', () => {
    expect(CATEGORY_PERMISSIONS).toEqual({
      VIEW: 'CATEGORY_VIEW',
      CREATE: 'CATEGORY_CREATE',
      UPDATE: 'CATEGORY_UPDATE',
      DELETE: 'CATEGORY_DELETE',
    });
  });
});
