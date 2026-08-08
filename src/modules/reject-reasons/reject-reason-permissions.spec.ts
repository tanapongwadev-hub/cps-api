import { REJECT_REASON_PERMISSIONS } from './reject-reason-permissions';

describe('REJECT_REASON_PERMISSIONS', () => {
  it('exposes the four CRUD permission codes', () => {
    expect(REJECT_REASON_PERMISSIONS).toEqual({
      VIEW: 'REJECT_REASON_VIEW',
      CREATE: 'REJECT_REASON_CREATE',
      UPDATE: 'REJECT_REASON_UPDATE',
      DELETE: 'REJECT_REASON_DELETE',
    });
  });
});
