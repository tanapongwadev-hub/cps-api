import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CancelGoodsReceiptDto } from './cancel-goods-receipt.dto';
import { CreateGoodsReceiptDto } from './create-goods-receipt.dto';
import { GoodsReceiptItemDto } from './goods-receipt-item.dto';
import { ListGoodsReceiptsQueryDto } from './list-goods-receipts-query.dto';
import { UpdateGoodsReceiptDto } from './update-goods-receipt.dto';

function errorsFor<T extends object>(
  cls: new () => T,
  payload: Record<string, unknown>,
): string[] {
  const instance = plainToInstance(cls, payload);
  return validateSync(instance, { whitelist: true }).map(
    (error) => error.property,
  );
}

describe('GoodsReceiptItemDto', () => {
  it('accepts a quantity with four decimal places', () => {
    expect(
      errorsFor(GoodsReceiptItemDto, {
        materialId: '5',
        qtyDelivered: '1234.5678',
        qtyReceived: '1234.5678',
      }),
    ).toEqual([]);
  });

  it('converts a numeric quantity to a string so precision survives', () => {
    const instance = plainToInstance(GoodsReceiptItemDto, {
      materialId: '5',
      qtyDelivered: 12.5,
      qtyReceived: 12.5,
    });
    expect(instance.qtyDelivered).toBe('12.5');
    expect(validateSync(instance)).toEqual([]);
  });

  it('rejects more than four decimal places', () => {
    expect(
      errorsFor(GoodsReceiptItemDto, {
        materialId: '5',
        qtyDelivered: '1.23456',
        qtyReceived: '1',
      }),
    ).toContain('qtyDelivered');
  });

  it('rejects a negative quantity', () => {
    expect(
      errorsFor(GoodsReceiptItemDto, {
        materialId: '5',
        qtyDelivered: '-1',
        qtyReceived: '1',
      }),
    ).toContain('qtyDelivered');
  });

  it('rejects a non-numeric material id', () => {
    expect(
      errorsFor(GoodsReceiptItemDto, {
        materialId: '0',
        qtyDelivered: '1',
        qtyReceived: '1',
      }),
    ).toContain('materialId');
  });

  it('rejects a malformed production date', () => {
    expect(
      errorsFor(GoodsReceiptItemDto, {
        materialId: '5',
        qtyDelivered: '1',
        qtyReceived: '1',
        productionDate: '08/08/2026',
      }),
    ).toContain('productionDate');
  });

  it('turns a blank lot number into null', () => {
    const instance = plainToInstance(GoodsReceiptItemDto, {
      materialId: '5',
      qtyDelivered: '1',
      qtyReceived: '1',
      lotNo: '   ',
    });
    expect(instance.lotNo).toBeNull();
  });
});

describe('CreateGoodsReceiptDto', () => {
  it('accepts a minimal payload', () => {
    expect(
      errorsFor(CreateGoodsReceiptDto, {
        supplierId: '2',
        receiptDate: '2026-08-08',
        items: [{ materialId: '5', qtyDelivered: '1', qtyReceived: '1' }],
      }),
    ).toEqual([]);
  });

  it('rejects a malformed receipt date', () => {
    expect(
      errorsFor(CreateGoodsReceiptDto, {
        supplierId: '2',
        receiptDate: '2026-8-8',
        items: [],
      }),
    ).toContain('receiptDate');
  });

  it('rejects an unknown attachment document type', () => {
    expect(
      errorsFor(CreateGoodsReceiptDto, {
        supplierId: '2',
        receiptDate: '2026-08-08',
        items: [],
        attachments: [
          { docType: 'CONTRACT', filePath: '/a.pdf', fileName: 'a.pdf' },
        ],
      }),
    ).toContain('attachments');
  });

  it('validates nested items', () => {
    expect(
      errorsFor(CreateGoodsReceiptDto, {
        supplierId: '2',
        receiptDate: '2026-08-08',
        items: [{ materialId: 'abc', qtyDelivered: '1', qtyReceived: '1' }],
      }),
    ).toContain('items');
  });
});

describe('UpdateGoodsReceiptDto', () => {
  it('accepts a full ISO 8601 timestamp', () => {
    expect(
      errorsFor(UpdateGoodsReceiptDto, {
        updatedAt: '2026-08-08T00:00:00.000Z',
      }),
    ).toEqual([]);
  });

  it('rejects a value that is not a date', () => {
    expect(
      errorsFor(UpdateGoodsReceiptDto, { updatedAt: 'yesterday' }),
    ).toContain('updatedAt');
  });

  it('rejects a calendar date that does not exist', () => {
    expect(
      errorsFor(UpdateGoodsReceiptDto, { updatedAt: '2026-02-30T00:00:00Z' }),
    ).toContain('updatedAt');
  });

  it('requires updatedAt to be present', () => {
    expect(errorsFor(UpdateGoodsReceiptDto, {})).toContain('updatedAt');
  });
});

describe('CancelGoodsReceiptDto', () => {
  it('requires a non-empty reason', () => {
    expect(errorsFor(CancelGoodsReceiptDto, { cancelReason: '   ' })).toContain(
      'cancelReason',
    );
  });
});

describe('ListGoodsReceiptsQueryDto', () => {
  it('defaults to newest receipt date first', () => {
    const instance = plainToInstance(ListGoodsReceiptsQueryDto, {});
    expect(instance.sortBy).toBe('receiptDate');
    expect(instance.sortOrder).toBe('desc');
    expect(instance.status).toBeUndefined();
  });

  it('parses hasRejection from a query string', () => {
    expect(
      plainToInstance(ListGoodsReceiptsQueryDto, { hasRejection: 'true' })
        .hasRejection,
    ).toBe(true);
    expect(
      plainToInstance(ListGoodsReceiptsQueryDto, { hasRejection: 'false' })
        .hasRejection,
    ).toBe(false);
  });

  it('rejects an unknown status', () => {
    expect(
      errorsFor(ListGoodsReceiptsQueryDto, { status: 'approved' }),
    ).toContain('status');
  });

  it('rejects an unknown sort field', () => {
    expect(
      errorsFor(ListGoodsReceiptsQueryDto, { sortBy: 'supplierName' }),
    ).toContain('sortBy');
  });
});
