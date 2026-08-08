import { getMetadataArgsStorage } from 'typeorm';
import { DocumentCounter } from './document-counter.entity';
import {
  GOODS_RECEIPT_DOC_TYPES,
  GoodsReceiptAttachment,
} from './goods-receipt-attachment.entity';
import { GoodsReceiptItem } from './goods-receipt-item.entity';
import { GOODS_RECEIPT_STATUSES, GoodsReceipt } from './goods-receipt.entity';

const storage = getMetadataArgsStorage();

function tableFor(target: unknown) {
  return storage.tables.find((table) => table.target === target);
}

function columnsFor(target: unknown) {
  return storage.columns.filter((column) => column.target === target);
}

function columnFor(target: unknown, propertyName: string) {
  return columnsFor(target).find(
    (column) => column.propertyName === propertyName,
  );
}

describe('inventory entities', () => {
  it.each([
    [GoodsReceipt, 'goods_receipts'],
    [GoodsReceiptItem, 'goods_receipt_items'],
    [GoodsReceiptAttachment, 'goods_receipt_attachments'],
    [DocumentCounter, 'document_counters'],
  ])('maps %p to the inventory schema', (target, name) => {
    const table = tableFor(target);
    expect(table?.schema).toBe('inventory');
    expect(table?.name).toBe(name);
  });

  it('stores quantities as NUMERIC(18,4) mapped to string', () => {
    for (const property of ['qtyDelivered', 'qtyReceived', 'qtyRejected']) {
      const column = columnFor(GoodsReceiptItem, property);
      expect(column?.options.type).toBe('numeric');
      expect(column?.options.precision).toBe(18);
      expect(column?.options.scale).toBe(4);
    }
  });

  it('stores prices as nullable NUMERIC(18,4)', () => {
    for (const property of ['unitPrice', 'lineAmount']) {
      const column = columnFor(GoodsReceiptItem, property);
      expect(column?.options.type).toBe('numeric');
      expect(column?.options.nullable).toBe(true);
    }
  });

  it('stores business dates as DATE, not TIMESTAMP', () => {
    expect(columnFor(GoodsReceipt, 'receiptDate')?.options.type).toBe('date');
    expect(columnFor(GoodsReceipt, 'supplierDocDate')?.options.type).toBe(
      'date',
    );
    expect(columnFor(GoodsReceiptItem, 'productionDate')?.options.type).toBe(
      'date',
    );
    expect(columnFor(GoodsReceiptItem, 'expiryDate')?.options.type).toBe(
      'date',
    );
  });

  it('keeps receiptNo nullable so a draft has no document number', () => {
    expect(columnFor(GoodsReceipt, 'receiptNo')?.options.nullable).toBe(true);
  });

  it('defaults a new receipt to draft', () => {
    expect(columnFor(GoodsReceipt, 'status')?.options.default).toBe('draft');
    expect(GOODS_RECEIPT_STATUSES).toEqual(['draft', 'posted', 'cancelled']);
  });

  it('defaults noSupplierDocument to false', () => {
    expect(columnFor(GoodsReceipt, 'noSupplierDocument')?.options.default).toBe(
      false,
    );
  });

  it('has no stock, cost, warehouse, or weighing columns', () => {
    const propertyNames = [
      ...columnsFor(GoodsReceipt),
      ...columnsFor(GoodsReceiptItem),
    ].map((column) => column.propertyName);
    for (const forbidden of [
      'warehouseId',
      'locationId',
      'weightIn',
      'weightOut',
      'netWeight',
      'qtyOnHand',
      'avgCost',
      'deliveryTypeId',
      'loadingPointId',
      'vehicleNo',
      'driverName',
      'conversionRate',
      'qtyBase',
    ]) {
      expect(propertyNames).not.toContain(forbidden);
    }
  });

  it('tracks who posted and who cancelled the document', () => {
    for (const property of [
      'postedBy',
      'postedAt',
      'cancelledBy',
      'cancelledAt',
      'cancelReason',
    ]) {
      expect(columnFor(GoodsReceipt, property)?.options.nullable).toBe(true);
    }
  });

  it('keeps both the material FK and its snapshot on each line', () => {
    expect(columnFor(GoodsReceiptItem, 'materialId')?.options.type).toBe(
      'bigint',
    );
    expect(columnFor(GoodsReceiptItem, 'materialCode')?.options.nullable).toBe(
      true,
    );
    expect(columnFor(GoodsReceiptItem, 'materialName')?.options.nullable).toBe(
      true,
    );
  });

  it('never updates an attachment row', () => {
    const propertyNames = columnsFor(GoodsReceiptAttachment).map(
      (column) => column.propertyName,
    );
    expect(propertyNames).toContain('createdAt');
    expect(propertyNames).not.toContain('updatedAt');
    expect(propertyNames).not.toContain('updatedBy');
  });

  it('limits attachment document types to four values', () => {
    expect(GOODS_RECEIPT_DOC_TYPES).toEqual([
      'DELIVERY_NOTE',
      'TAX_INVOICE',
      'PHOTO',
      'OTHER',
    ]);
  });

  it('scopes the document counter per organization, type, and period', () => {
    const index = storage.indices.find(
      (candidate) => candidate.target === DocumentCounter,
    );
    expect(index?.unique).toBe(true);
    expect(index?.columns).toEqual(['organizationId', 'docType', 'period']);
  });
});
