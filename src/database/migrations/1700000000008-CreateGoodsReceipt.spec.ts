import type { QueryRunner } from 'typeorm';
import { CreateGoodsReceipt1700000000008 } from './1700000000008-CreateGoodsReceipt';

function makeQueryRunner() {
  const queries: string[] = [];
  const queryRunner = {
    query: jest.fn((sql: string) => {
      queries.push(sql);
      return Promise.resolve([]);
    }),
  } as unknown as QueryRunner;
  return { queryRunner, queries };
}

async function runUp(): Promise<string> {
  const { queryRunner, queries } = makeQueryRunner();
  await new CreateGoodsReceipt1700000000008().up(queryRunner);
  return queries.join('\n');
}

describe('CreateGoodsReceipt1700000000008', () => {
  it('has a stable migration name', () => {
    expect(new CreateGoodsReceipt1700000000008().name).toBe(
      'CreateGoodsReceipt1700000000008',
    );
  });

  it('creates the inventory schema and all five tables', async () => {
    const sql = await runUp();
    expect(sql).toContain('CREATE SCHEMA IF NOT EXISTS inventory');
    expect(sql).toContain('CREATE TABLE master.reject_reasons');
    expect(sql).toContain('CREATE TABLE inventory.document_counters');
    expect(sql).toContain('CREATE TABLE inventory.goods_receipts');
    expect(sql).toContain('CREATE TABLE inventory.goods_receipt_items');
    expect(sql).toContain('CREATE TABLE inventory.goods_receipt_attachments');
  });

  it('stores quantities and prices as NUMERIC(18,4), never floating point', async () => {
    const sql = await runUp();
    for (const column of [
      'qty_delivered',
      'qty_received',
      'qty_rejected',
      'unit_price',
      'line_amount',
    ]) {
      expect(sql).toMatch(new RegExp(`${column} NUMERIC\\(18,4\\)`));
    }
    expect(sql).not.toMatch(/DOUBLE PRECISION|\bREAL\b/i);
  });

  it('keeps receipt_no nullable so drafts have no document number', async () => {
    const sql = await runUp();
    expect(sql).toMatch(/receipt_no VARCHAR\(30\),/);
  });

  it('scopes the receipt number uniqueness to the organization', async () => {
    const sql = await runUp();
    expect(sql).toContain('uq_goods_receipts_receipt_no');
    expect(sql).toMatch(
      /ON inventory\.goods_receipts\(organization_id, receipt_no\)\s+WHERE receipt_no IS NOT NULL/,
    );
  });

  it('lets a cancelled receipt release its supplier document number', async () => {
    const sql = await runUp();
    expect(sql).toContain('uq_goods_receipts_supplier_doc_no');
    expect(sql).toContain("status <> 'cancelled'");
    expect(sql).toContain('no_supplier_document = false');
  });

  it('allows the same material on different lots but not the same lot twice', async () => {
    const sql = await runUp();
    expect(sql).toMatch(
      /uq_goods_receipt_items_material_lot[\s\S]*COALESCE\(lot_no, ''\)/,
    );
  });

  it('enforces the quantity rules in the database as well', async () => {
    const sql = await runUp();
    expect(sql).toContain('qty_received + qty_rejected <= qty_delivered');
    expect(sql).toContain('qty_received > 0 OR qty_rejected > 0');
    expect(sql).toContain('qty_rejected = 0 OR reject_reason_id IS NOT NULL');
  });

  it('restricts the status column to the three known values', async () => {
    const sql = await runUp();
    expect(sql).toContain("status IN ('draft', 'posted', 'cancelled')");
  });

  it('requires audit fields once a receipt is posted or cancelled', async () => {
    const sql = await runUp();
    expect(sql).toContain('chk_goods_receipts_posted_fields');
    expect(sql).toContain('chk_goods_receipts_cancelled_fields');
  });

  it('cascades lines and attachments but restricts master data deletes', async () => {
    const sql = await runUp();
    expect(sql).toMatch(
      /fk_goods_receipt_items_receipt[\s\S]*inventory\.goods_receipts\(id\) ON DELETE CASCADE/,
    );
    expect(sql).toMatch(
      /fk_goods_receipt_items_material[\s\S]*master\.materials\(id\) ON DELETE RESTRICT/,
    );
    expect(sql).toMatch(
      /fk_goods_receipts_supplier[\s\S]*master\.suppliers\(id\) ON DELETE RESTRICT/,
    );
  });

  it('limits attachment document types', async () => {
    const sql = await runUp();
    expect(sql).toContain(
      "doc_type IN ('DELIVERY_NOTE', 'TAX_INVOICE', 'PHOTO', 'OTHER')",
    );
  });

  it('drops everything it created in reverse order', async () => {
    const { queryRunner, queries } = makeQueryRunner();
    await new CreateGoodsReceipt1700000000008().down(queryRunner);
    const sql = queries.join('\n');
    expect(queries[0]).toContain('goods_receipt_attachments');
    expect(sql).toContain('DROP TABLE IF EXISTS inventory.goods_receipts');
    expect(sql).toContain('DROP TABLE IF EXISTS master.reject_reasons');
    expect(sql).toContain('DROP SCHEMA IF EXISTS inventory');
  });
});
