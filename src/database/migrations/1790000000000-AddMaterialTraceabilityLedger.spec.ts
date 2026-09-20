import type { QueryRunner } from 'typeorm';
import { AddMaterialTraceabilityLedger1790000000000 } from './1790000000000-AddMaterialTraceabilityLedger';

function makeQueryRunner() {
  const calls: string[] = [];
  const queryRunner = {
    query: jest.fn((sql: string) => {
      calls.push(sql);
      return Promise.resolve([]);
    }),
  } as unknown as QueryRunner;
  return { queryRunner, calls };
}

describe('AddMaterialTraceabilityLedger1790000000000', () => {
  it('has a stable migration name', () => {
    expect(new AddMaterialTraceabilityLedger1790000000000().name).toBe(
      'AddMaterialTraceabilityLedger1790000000000',
    );
  });

  describe('up()', () => {
    it('backfills trace_id on receiving and disbursement documents before making it NOT NULL', async () => {
      const { queryRunner, calls } = makeQueryRunner();
      await new AddMaterialTraceabilityLedger1790000000000().up(queryRunner);

      const receivingBackfillIndex = calls.findIndex((sql) =>
        sql.includes("SET trace_id = 'TRC-RCV-'"),
      );
      const receivingNotNullIndex = calls.findIndex(
        (sql) =>
          sql.includes('inventory.material_receivings') &&
          sql.includes('ALTER COLUMN trace_id SET NOT NULL'),
      );
      expect(receivingBackfillIndex).toBeGreaterThanOrEqual(0);
      expect(receivingNotNullIndex).toBeGreaterThan(receivingBackfillIndex);

      const disbursementBackfillIndex = calls.findIndex((sql) =>
        sql.includes("SET trace_id = 'TRC-ISS-'"),
      );
      const disbursementNotNullIndex = calls.findIndex(
        (sql) =>
          sql.includes('inventory.materials_disbursements') &&
          sql.includes('ALTER COLUMN trace_id SET NOT NULL'),
      );
      expect(disbursementBackfillIndex).toBeGreaterThanOrEqual(0);
      expect(disbursementNotNullIndex).toBeGreaterThan(
        disbursementBackfillIndex,
      );
    });

    it('widens stock_transactions.transaction_type to the full traceability set (never narrows it)', async () => {
      const { queryRunner, calls } = makeQueryRunner();
      await new AddMaterialTraceabilityLedger1790000000000().up(queryRunner);

      const checkConstraint = calls.find(
        (sql) =>
          sql.includes('chk_stock_transactions_type') && sql.includes('CHECK'),
      );
      expect(checkConstraint).toBeDefined();
      for (const type of [
        'RECEIVE',
        'ISSUE',
        'RETURN',
        'ADJUST_IN',
        'ADJUST_OUT',
        'TRANSFER_IN',
        'TRANSFER_OUT',
        'CANCEL',
      ]) {
        expect(checkConstraint).toContain(type);
      }
    });

    it('backfills legacy ADJUST rows to CANCEL strictly between dropping the old type constraint and adding the new one (confirmed against real data: every legacy ADJUST row is a cancellation reversal, never a physical-count correction)', async () => {
      const { queryRunner, calls } = makeQueryRunner();
      await new AddMaterialTraceabilityLedger1790000000000().up(queryRunner);

      const backfillIndex = calls.findIndex(
        (sql) =>
          sql.includes('UPDATE inventory.stock_transactions') &&
          sql.includes("SET transaction_type = 'CANCEL'") &&
          sql.includes("WHERE transaction_type = 'ADJUST'"),
      );
      const dropIndex = calls.findIndex(
        (sql) =>
          sql.includes('chk_stock_transactions_type') &&
          sql.includes('DROP CONSTRAINT'),
      );
      const addIndex = calls.findIndex(
        (sql) =>
          sql.includes('chk_stock_transactions_type') &&
          sql.includes('ADD CONSTRAINT'),
      );
      expect(backfillIndex).toBeGreaterThanOrEqual(0);
      // The backfill writes 'CANCEL', which only the OLD constraint (still
      // active before dropIndex) would reject — it must run after the old
      // constraint is dropped and before the new one is added, never before
      // the drop (regression guard for the exact ordering bug this
      // migration originally shipped with).
      expect(backfillIndex).toBeGreaterThan(dropIndex);
      expect(addIndex).toBeGreaterThan(backfillIndex);
    });

    it('widens the receiving-package status constraint to include partial and cancelled', async () => {
      const { queryRunner, calls } = makeQueryRunner();
      await new AddMaterialTraceabilityLedger1790000000000().up(queryRunner);

      const checkConstraint = calls.find(
        (sql) =>
          sql.includes('chk_material_receiving_packages_status') &&
          sql.includes('CHECK'),
      );
      expect(checkConstraint).toBeDefined();
      expect(checkConstraint).toContain('partial');
      expect(checkConstraint).toContain('cancelled');
    });

    it('changes the receiving-package parent FK from cascade to restrict — never CASCADE', async () => {
      const { queryRunner, calls } = makeQueryRunner();
      await new AddMaterialTraceabilityLedger1790000000000().up(queryRunner);

      const fk = calls.find(
        (sql) =>
          sql.includes('fk_material_receiving_packages_receiving') &&
          sql.includes('ADD CONSTRAINT'),
      );
      expect(fk).toBeDefined();
      expect(fk).toContain('ON DELETE RESTRICT');
      expect(fk).not.toContain('ON DELETE CASCADE');
    });

    it('drops every FK constraint before re-adding it, guarding against a partial re-run', async () => {
      const { queryRunner, calls } = makeQueryRunner();
      await new AddMaterialTraceabilityLedger1790000000000().up(queryRunner);

      const fkNames = [
        'fk_materials_disbursements_department',
        'fk_materials_disbursements_approved_by',
        'fk_material_disbursement_packages_reversed_by',
        'fk_stock_transactions_main_qr',
        'fk_stock_transactions_sub_qr',
        'fk_stock_transactions_unit',
        'fk_stock_transactions_department',
        'fk_stock_transactions_source_location',
        'fk_stock_transactions_destination_location',
      ];
      for (const name of fkNames) {
        const dropIndex = calls.findIndex((sql) =>
          sql.includes(`DROP CONSTRAINT IF EXISTS ${name}`),
        );
        const addIndex = calls.findIndex((sql) =>
          sql.includes(`ADD CONSTRAINT ${name}`),
        );
        expect(dropIndex).toBeGreaterThanOrEqual(0);
        expect(addIndex).toBeGreaterThan(dropIndex);
      }
    });
  });

  describe('down()', () => {
    it('restores the receiving-package status constraint to exactly its pre-migration set (no partial, no cancelled)', async () => {
      const { queryRunner, calls } = makeQueryRunner();
      await new AddMaterialTraceabilityLedger1790000000000().down(queryRunner);

      const checkConstraint = calls.find(
        (sql) =>
          sql.includes('chk_material_receiving_packages_status') &&
          sql.includes('CHECK'),
      );
      expect(checkConstraint).toBeDefined();
      // Confirmed directly against the live database (not assumed from
      // application code/docs): the deployed constraint before this
      // migration only ever allowed these five values — 'partial' was
      // already being written by materials-disbursement's FIFO logic, but
      // had never actually been added to the DB constraint, meaning it was
      // silently violating it in production. down() restores the true
      // pre-migration state, not the code's aspirational assumption.
      for (const status of [
        'pending',
        'in_stock',
        'issued',
        'damaged',
        'returned',
      ]) {
        expect(checkConstraint).toContain(status);
      }
      expect(checkConstraint).not.toContain('partial');
      expect(checkConstraint).not.toContain('cancelled');
    });

    it('restores the receiving-package parent FK back to cascade', async () => {
      const { queryRunner, calls } = makeQueryRunner();
      await new AddMaterialTraceabilityLedger1790000000000().down(queryRunner);

      const fk = calls.find(
        (sql) =>
          sql.includes('fk_material_receiving_packages_receiving') &&
          sql.includes('ADD CONSTRAINT'),
      );
      expect(fk).toBeDefined();
      expect(fk).toContain('ON DELETE CASCADE');
    });

    it('narrows stock_transactions.transaction_type back to the legacy RECEIVE/ISSUE/ADJUST set', async () => {
      const { queryRunner, calls } = makeQueryRunner();
      await new AddMaterialTraceabilityLedger1790000000000().down(queryRunner);

      const checkConstraint = calls.find(
        (sql) =>
          sql.includes('chk_stock_transactions_type') && sql.includes('CHECK'),
      );
      expect(checkConstraint).toBeDefined();
      expect(checkConstraint).toContain("'RECEIVE', 'ISSUE', 'ADJUST'");
    });

    it('drops every column it added in up()', async () => {
      const { queryRunner, calls } = makeQueryRunner();
      await new AddMaterialTraceabilityLedger1790000000000().down(queryRunner);

      const droppedColumns = [
        'trace_id',
        'transaction_no',
        'main_qr_id',
        'sub_qr_id',
        'unit_id',
        'department_id',
        'production_order',
        'reference_no',
        'source_location_id',
        'destination_location_id',
        'reason',
      ];
      const stockTransactionsDrop = calls.find(
        (sql) =>
          sql.includes('inventory.stock_transactions') &&
          sql.includes('DROP COLUMN'),
      );
      expect(stockTransactionsDrop).toBeDefined();
      for (const column of droppedColumns) {
        expect(stockTransactionsDrop).toContain(
          `DROP COLUMN IF EXISTS ${column}`,
        );
      }
    });
  });
});
