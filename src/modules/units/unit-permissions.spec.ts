import { UNIT_PERMISSIONS } from './unit-permissions';

describe('UNIT_PERMISSIONS', () => {
  it('exposes the four CRUD permission codes', () => {
    expect(UNIT_PERMISSIONS).toEqual({
      VIEW: 'UNIT_VIEW',
      CREATE: 'UNIT_CREATE',
      UPDATE: 'UNIT_UPDATE',
      DELETE: 'UNIT_DELETE',
    });
  });

  it('uses uppercase snake_case codes', () => {
    for (const value of Object.values(UNIT_PERMISSIONS)) {
      expect(value).toMatch(/^UNIT_[A-Z]+$/);
    }
  });
});
