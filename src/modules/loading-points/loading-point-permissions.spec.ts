import { LOADING_POINT_PERMISSIONS } from './loading-point-permissions';

describe('LOADING_POINT_PERMISSIONS', () => {
  it('exposes the four CRUD permission codes', () => {
    expect(LOADING_POINT_PERMISSIONS).toEqual({
      VIEW: 'LOADING_POINT_VIEW',
      CREATE: 'LOADING_POINT_CREATE',
      UPDATE: 'LOADING_POINT_UPDATE',
      DELETE: 'LOADING_POINT_DELETE',
    });
  });
});
