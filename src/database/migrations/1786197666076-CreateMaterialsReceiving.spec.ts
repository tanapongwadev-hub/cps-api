import type { QueryRunner } from 'typeorm';
import { CreateMaterialsReceiving1786197666076 } from './1786197666076-CreateMaterialsReceiving';

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
  await new CreateMaterialsReceiving1786197666076().up(queryRunner);
  return queries.join('\n');
}

describe('CreateMaterialsReceiving1786197666076', () => {
  it('has a stable migration name', () => {
    expect(new CreateMaterialsReceiving1786197666076().name).toBe(
      'CreateMaterialsReceiving1786197666076',
    );
  });

  it('creates all five tables inside the inventory schema', async () => {
    const sql = await runUp();
    expect(sql).toContain(
      'CREATE TABLE inventory.material_receiving_lot_counters',
    );
    expect(sql).toContain('CREATE TABLE inventory.stock_balances');
    expect(sql).toContain('CREATE TABLE inventory.material_receivings');
    expect(sql).toContain('CREATE TABLE inventory.material_receiving_packages');
    expect(sql).toContain('CREATE TABLE inventory.stock_transactions');
  });

  it('stores numeric columns as NUMERIC(18,4), never floating point', async () => {
    const sql = await runUp();
    for (const column of [
      'receive_quantity',
      'quantity', // packages + balances
      'quantity_before',
      'quantity_in',
      'quantity_out',
      'quantity_after',
    ]) {
      expect(sql).toMatch(new RegExp(`${column} NUMERIC\\(18,4\\)`));
    }
    expect(sql).not.toMatch(/DOUBLE PRECISION|\bREAL\b/i);
  });

  it('keeps internal_lot_no unique so duplicates cannot slip through', async () => {
    const sql = await runUp();
    expect(sql).toContain('uq_material_receivings_internal_lot_no');
    expect(sql).toContain('internal_lot_no VARCHAR(30) NOT NULL');
  });

  it('enforces an optional idempotency_key uniqueness so retries do not double-book', async () => {
    const sql = await runUp();
    expect(sql).toContain('uq_material_receivings_idempotency_key');
    expect(sql).toMatch(
      /uq_material_receivings_idempotency_key[\s\S]*WHERE idempotency_key IS NOT NULL/,
    );
  });

  it('restricts the status column to draft | confirmed | cancelled', async () => {
    const sql = await runUp();
    expect(sql).toContain("status IN ('draft', 'confirmed', 'cancelled')");
  });

  it('requires the package count to fit the receive quantity', async () => {
    const sql = await runUp();
    expect(sql).toContain('receive_quantity > 0');
    expect(sql).toContain('packing_quantity > 0');
    expect(sql).toContain('package_count > 0');
    expect(sql).toContain(
      'package_count >= CEIL(receive_quantity / packing_quantity)',
    );
  });

  it('requires audit fields once a receiving is confirmed or cancelled', async () => {
    const sql = await runUp();
    expect(sql).toContain('chk_material_receivings_confirmed_fields');
    expect(sql).toContain('chk_material_receivings_cancelled_fields');
  });

  it('restricts the stock transaction movement to a single direction', async () => {
    const sql = await runUp();
    expect(sql).toContain("transaction_type IN ('RECEIVE', 'ISSUE', 'ADJUST')");
    expect(sql).toContain("reference_type IN ('MATERIAL_RECEIVING')");
    expect(sql).toContain(
      'quantity_after = quantity_before + quantity_in - quantity_out',
    );
  });

  it('cascades package deletes with the receiving but restricts master data', async () => {
    const sql = await runUp();
    expect(sql).toMatch(
      /fk_material_receiving_packages_receiving[\s\S]*inventory\.material_receivings\(id\) ON DELETE CASCADE/,
    );
    expect(sql).toMatch(
      /fk_material_receivings_material[\s\S]*master\.materials\(id\) ON DELETE RESTRICT/,
    );
    expect(sql).toMatch(
      /fk_stock_transactions_material[\s\S]*master\.materials\(id\) ON DELETE RESTRICT/,
    );
    expect(sql).toMatch(
      /fk_stock_balances_material[\s\S]*master\.materials\(id\) ON DELETE RESTRICT/,
    );
  });

  it('forces stock balance quantity to never go negative', async () => {
    const sql = await runUp();
    expect(sql).toContain('chk_stock_balances_qty_non_negative');
    expect(sql).toContain('quantity >= 0');
  });

  it('drops every table it created in reverse order', async () => {
    const { queryRunner, queries } = makeQueryRunner();
    await new CreateMaterialsReceiving1786197666076().down(queryRunner);
    const sql = queries.join('\n');
    expect(queries[0]).toContain('stock_transactions');
    expect(sql).toContain(
      'DROP TABLE IF EXISTS inventory.material_receiving_packages',
    );
    expect(sql).toContain('DROP TABLE IF EXISTS inventory.material_receivings');
    expect(sql).toContain('DROP TABLE IF EXISTS inventory.stock_balances');
    expect(sql).toContain(
      'DROP TABLE IF EXISTS inventory.material_receiving_lot_counters',
    );
  });
});
