import { GOODS_RECEIPT_PERMISSIONS } from './goods-receipt-permissions';

describe('GOODS_RECEIPT_PERMISSIONS', () => {
  it('exposes CRUD plus the document actions POST and CANCEL', () => {
    expect(GOODS_RECEIPT_PERMISSIONS).toEqual({
      VIEW: 'GOODS_RECEIPT_VIEW',
      CREATE: 'GOODS_RECEIPT_CREATE',
      UPDATE: 'GOODS_RECEIPT_UPDATE',
      DELETE: 'GOODS_RECEIPT_DELETE',
      POST: 'GOODS_RECEIPT_POST',
      CANCEL: 'GOODS_RECEIPT_CANCEL',
    });
  });

  it('keeps POST separate from UPDATE and CANCEL separate from DELETE', () => {
    expect(GOODS_RECEIPT_PERMISSIONS.POST).not.toBe(
      GOODS_RECEIPT_PERMISSIONS.UPDATE,
    );
    expect(GOODS_RECEIPT_PERMISSIONS.CANCEL).not.toBe(
      GOODS_RECEIPT_PERMISSIONS.DELETE,
    );
  });
});
