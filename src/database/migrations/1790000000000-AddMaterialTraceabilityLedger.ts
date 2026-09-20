import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Deepens the existing stock_transactions ledger for end-to-end material
 * traceability. Existing receiving/disbursement/package tables remain the
 * source records; this migration only adds correlation and audit dimensions.
 */
export class AddMaterialTraceabilityLedger1790000000000 implements MigrationInterface {
  name = 'AddMaterialTraceabilityLedger1790000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE inventory.material_receivings
        ADD COLUMN IF NOT EXISTS trace_id VARCHAR(40)
    `);
    await queryRunner.query(`
      UPDATE inventory.material_receivings
      SET trace_id = 'TRC-RCV-' || LPAD(id::TEXT, 12, '0')
      WHERE trace_id IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE inventory.material_receivings
        ALTER COLUMN trace_id SET NOT NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_material_receivings_trace_id
        ON inventory.material_receivings(trace_id)
    `);

    await queryRunner.query(`
      ALTER TABLE inventory.materials_disbursements
        ADD COLUMN IF NOT EXISTS trace_id VARCHAR(40),
        ADD COLUMN IF NOT EXISTS department_id BIGINT,
        ADD COLUMN IF NOT EXISTS production_order VARCHAR(80),
        ADD COLUMN IF NOT EXISTS reference_no VARCHAR(80),
        ADD COLUMN IF NOT EXISTS requested_by VARCHAR(150),
        ADD COLUMN IF NOT EXISTS approved_by BIGINT
    `);
    await queryRunner.query(`
      UPDATE inventory.materials_disbursements
      SET trace_id = 'TRC-ISS-' || LPAD(id::TEXT, 12, '0')
      WHERE trace_id IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE inventory.materials_disbursements
        ALTER COLUMN trace_id SET NOT NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_materials_disbursements_trace_id
        ON inventory.materials_disbursements(trace_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_materials_disbursements_department_id
        ON inventory.materials_disbursements(department_id)
    `);
    await queryRunner.query(`
      ALTER TABLE inventory.materials_disbursements
        DROP CONSTRAINT IF EXISTS fk_materials_disbursements_department,
        DROP CONSTRAINT IF EXISTS fk_materials_disbursements_approved_by
    `);
    await queryRunner.query(`
      ALTER TABLE inventory.materials_disbursements
        ADD CONSTRAINT fk_materials_disbursements_department
          FOREIGN KEY (department_id) REFERENCES iam.departments(id) ON DELETE RESTRICT,
        ADD CONSTRAINT fk_materials_disbursements_approved_by
          FOREIGN KEY (approved_by) REFERENCES iam.users(id) ON DELETE SET NULL
    `);

    await queryRunner.query(`
      ALTER TABLE inventory.material_disbursement_packages
        ADD COLUMN IF NOT EXISTS fifo_order INTEGER,
        ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMP,
        ADD COLUMN IF NOT EXISTS reversed_by BIGINT
    `);
    await queryRunner.query(`
      ALTER TABLE inventory.material_disbursement_packages
        DROP CONSTRAINT IF EXISTS fk_material_disbursement_packages_reversed_by
    `);
    await queryRunner.query(`
      ALTER TABLE inventory.material_disbursement_packages
        ADD CONSTRAINT fk_material_disbursement_packages_reversed_by
          FOREIGN KEY (reversed_by) REFERENCES iam.users(id) ON DELETE SET NULL
    `);

    await queryRunner.query(`
      ALTER TABLE inventory.stock_transactions
        ADD COLUMN IF NOT EXISTS transaction_no VARCHAR(50),
        ADD COLUMN IF NOT EXISTS trace_id VARCHAR(40),
        ADD COLUMN IF NOT EXISTS main_qr_id BIGINT,
        ADD COLUMN IF NOT EXISTS sub_qr_id BIGINT,
        ADD COLUMN IF NOT EXISTS unit_id BIGINT,
        ADD COLUMN IF NOT EXISTS department_id BIGINT,
        ADD COLUMN IF NOT EXISTS production_order VARCHAR(80),
        ADD COLUMN IF NOT EXISTS reference_no VARCHAR(80),
        ADD COLUMN IF NOT EXISTS source_location_id BIGINT,
        ADD COLUMN IF NOT EXISTS destination_location_id BIGINT,
        ADD COLUMN IF NOT EXISTS reason TEXT
    `);
    await queryRunner.query(`
      UPDATE inventory.stock_transactions st
      SET
        transaction_no = COALESCE(st.transaction_no, 'TXN-' || LPAD(st.id::TEXT, 14, '0')),
        trace_id = COALESCE(
          st.trace_id,
          CASE st.reference_type
            WHEN 'MATERIAL_RECEIVING' THEN 'TRC-RCV-' || LPAD(st.reference_id::TEXT, 12, '0')
            WHEN 'MATERIALS_DISBURSEMENT' THEN 'TRC-ISS-' || LPAD(st.reference_id::TEXT, 12, '0')
            ELSE 'TRC-LEG-' || LPAD(st.id::TEXT, 12, '0')
          END
        ),
        main_qr_id = COALESCE(
          st.main_qr_id,
          CASE
            WHEN st.reference_type = 'MATERIAL_RECEIVING' THEN st.reference_id
            ELSE (
              SELECT mr.id
              FROM inventory.material_receivings mr
              WHERE mr.internal_lot_no = st.reference_lot_no
              LIMIT 1
            )
          END
        ),
        unit_id = COALESCE(st.unit_id, m.unit_id)
      FROM master.materials m
      WHERE m.id = st.material_id
    `);
    await queryRunner.query(`
      ALTER TABLE inventory.stock_transactions
        ALTER COLUMN transaction_no SET NOT NULL,
        ALTER COLUMN trace_id SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE inventory.stock_transactions
        DROP CONSTRAINT IF EXISTS chk_stock_transactions_type
    `);
    // The legacy type set was RECEIVE/ISSUE/ADJUST — the new set drops the
    // generic 'ADJUST' in favor of ADJUST_IN/ADJUST_OUT (physical stock
    // count corrections) and a dedicated CANCEL (reversal of an original
    // transaction). Every legacy 'ADJUST' row found in this dev database is
    // in fact a cancellation reversal written by the old receiving-cancel
    // code path (confirmed by inspecting its remark, e.g. "Cancelled
    // receiving ...") — recategorize it as CANCEL, which is exactly what
    // the current code now writes for that same event, rather than
    // guessing a direction (ADJUST_IN vs ADJUST_OUT) for what was never a
    // physical-count correction to begin with. Must run after the old
    // constraint is dropped (above) and before the new one is added
    // (below) — the old constraint doesn't allow 'CANCEL' either.
    await queryRunner.query(`
      UPDATE inventory.stock_transactions
      SET transaction_type = 'CANCEL'
      WHERE transaction_type = 'ADJUST'
    `);
    await queryRunner.query(`
      ALTER TABLE inventory.stock_transactions
        ADD CONSTRAINT chk_stock_transactions_type
          CHECK (transaction_type IN (
            'RECEIVE', 'ISSUE', 'RETURN', 'ADJUST_IN', 'ADJUST_OUT',
            'TRANSFER_IN', 'TRANSFER_OUT', 'CANCEL'
          ))
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_transactions_transaction_no
        ON inventory.stock_transactions(transaction_no)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_stock_transactions_trace_id
        ON inventory.stock_transactions(trace_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_stock_transactions_main_qr_id
        ON inventory.stock_transactions(main_qr_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_stock_transactions_sub_qr_id
        ON inventory.stock_transactions(sub_qr_id)
    `);
    await queryRunner.query(`
      ALTER TABLE inventory.stock_transactions
        DROP CONSTRAINT IF EXISTS fk_stock_transactions_main_qr,
        DROP CONSTRAINT IF EXISTS fk_stock_transactions_sub_qr,
        DROP CONSTRAINT IF EXISTS fk_stock_transactions_unit,
        DROP CONSTRAINT IF EXISTS fk_stock_transactions_department,
        DROP CONSTRAINT IF EXISTS fk_stock_transactions_source_location,
        DROP CONSTRAINT IF EXISTS fk_stock_transactions_destination_location
    `);
    await queryRunner.query(`
      ALTER TABLE inventory.stock_transactions
        ADD CONSTRAINT fk_stock_transactions_main_qr
          FOREIGN KEY (main_qr_id) REFERENCES inventory.material_receivings(id) ON DELETE RESTRICT,
        ADD CONSTRAINT fk_stock_transactions_sub_qr
          FOREIGN KEY (sub_qr_id) REFERENCES inventory.material_receiving_packages(id) ON DELETE RESTRICT,
        ADD CONSTRAINT fk_stock_transactions_unit
          FOREIGN KEY (unit_id) REFERENCES master.units(id) ON DELETE RESTRICT,
        ADD CONSTRAINT fk_stock_transactions_department
          FOREIGN KEY (department_id) REFERENCES iam.departments(id) ON DELETE RESTRICT,
        ADD CONSTRAINT fk_stock_transactions_source_location
          FOREIGN KEY (source_location_id) REFERENCES master.locations(id) ON DELETE RESTRICT,
        ADD CONSTRAINT fk_stock_transactions_destination_location
          FOREIGN KEY (destination_location_id) REFERENCES master.locations(id) ON DELETE RESTRICT
    `);

    await queryRunner.query(`
      ALTER TABLE iam.audit_logs
        ADD COLUMN IF NOT EXISTS trace_id VARCHAR(40),
        ADD COLUMN IF NOT EXISTS request_id VARCHAR(80),
        ADD COLUMN IF NOT EXISTS reason TEXT
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_trace_id
        ON iam.audit_logs(trace_id)
    `);

    await queryRunner.query(`
      ALTER TABLE inventory.material_receiving_packages
        DROP CONSTRAINT IF EXISTS fk_material_receiving_packages_receiving
    `);
    await queryRunner.query(`
      ALTER TABLE inventory.material_receiving_packages
        ADD CONSTRAINT fk_material_receiving_packages_receiving
          FOREIGN KEY (material_receiving_id)
          REFERENCES inventory.material_receivings(id) ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      ALTER TABLE inventory.material_receiving_packages
        DROP CONSTRAINT IF EXISTS chk_material_receiving_packages_status
    `);
    await queryRunner.query(`
      ALTER TABLE inventory.material_receiving_packages
        ADD CONSTRAINT chk_material_receiving_packages_status
          CHECK (status IN (
            'pending', 'in_stock', 'partial', 'issued', 'damaged',
            'returned', 'cancelled'
          ))
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE inventory.material_receiving_packages
        DROP CONSTRAINT IF EXISTS chk_material_receiving_packages_status
    `);
    // Restores the constraint to exactly what it was immediately before
    // this migration's up() ran — confirmed directly against the live
    // database (not assumed from application code/docs, which incorrectly
    // implied 'partial' already worked): the deployed constraint only ever
    // allowed pending/in_stock/issued/damaged/returned. materials-disbursement
    // .service.ts's FIFO logic already writes status: 'partial' on a
    // partially-consumed package — meaning that write was already violating
    // this constraint in production before this migration's up() widens it.
    // If this down() ever runs after real 'partial' package rows exist,
    // Postgres will refuse (ADD CONSTRAINT validates existing rows) rather
    // than silently leaving the table in a state the reverted constraint
    // can't actually describe — that failure is the correct, safe behavior
    // for this rollback, not a bug to work around.
    await queryRunner.query(`
      ALTER TABLE inventory.material_receiving_packages
        ADD CONSTRAINT chk_material_receiving_packages_status
          CHECK (status IN ('pending', 'in_stock', 'issued', 'damaged', 'returned'))
    `);
    await queryRunner.query(`
      ALTER TABLE inventory.material_receiving_packages
        DROP CONSTRAINT IF EXISTS fk_material_receiving_packages_receiving
    `);
    await queryRunner.query(`
      ALTER TABLE inventory.material_receiving_packages
        ADD CONSTRAINT fk_material_receiving_packages_receiving
          FOREIGN KEY (material_receiving_id)
          REFERENCES inventory.material_receivings(id) ON DELETE CASCADE
    `);
    await queryRunner.query(`DROP INDEX IF EXISTS iam.idx_audit_logs_trace_id`);
    await queryRunner.query(`
      ALTER TABLE iam.audit_logs
        DROP COLUMN IF EXISTS reason,
        DROP COLUMN IF EXISTS request_id,
        DROP COLUMN IF EXISTS trace_id
    `);
    await queryRunner.query(`
      ALTER TABLE inventory.stock_transactions
        DROP CONSTRAINT IF EXISTS fk_stock_transactions_destination_location,
        DROP CONSTRAINT IF EXISTS fk_stock_transactions_source_location,
        DROP CONSTRAINT IF EXISTS fk_stock_transactions_department,
        DROP CONSTRAINT IF EXISTS fk_stock_transactions_unit,
        DROP CONSTRAINT IF EXISTS fk_stock_transactions_sub_qr,
        DROP CONSTRAINT IF EXISTS fk_stock_transactions_main_qr,
        DROP CONSTRAINT IF EXISTS chk_stock_transactions_type
    `);
    // Deliberately does NOT try to map RETURN/ADJUST_IN/ADJUST_OUT/
    // TRANSFER_IN/TRANSFER_OUT/CANCEL rows back to the legacy 'ADJUST'
    // value — several of the new types have no faithful legacy equivalent,
    // and any row using them (including ones the new application code wrote
    // after this migration went live, not just the one legacy row this
    // migration's up() backfills) would make this ADD CONSTRAINT fail
    // loudly, same "a rollback that can't be done safely should refuse, not
    // guess" philosophy as the receiving-package status constraint above.
    await queryRunner.query(`
      ALTER TABLE inventory.stock_transactions
        ADD CONSTRAINT chk_stock_transactions_type
          CHECK (transaction_type IN ('RECEIVE', 'ISSUE', 'ADJUST'))
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS inventory.uq_stock_transactions_transaction_no;
      DROP INDEX IF EXISTS inventory.idx_stock_transactions_trace_id;
      DROP INDEX IF EXISTS inventory.idx_stock_transactions_main_qr_id;
      DROP INDEX IF EXISTS inventory.idx_stock_transactions_sub_qr_id
    `);
    await queryRunner.query(`
      ALTER TABLE inventory.stock_transactions
        DROP COLUMN IF EXISTS reason,
        DROP COLUMN IF EXISTS destination_location_id,
        DROP COLUMN IF EXISTS source_location_id,
        DROP COLUMN IF EXISTS reference_no,
        DROP COLUMN IF EXISTS production_order,
        DROP COLUMN IF EXISTS department_id,
        DROP COLUMN IF EXISTS unit_id,
        DROP COLUMN IF EXISTS sub_qr_id,
        DROP COLUMN IF EXISTS main_qr_id,
        DROP COLUMN IF EXISTS trace_id,
        DROP COLUMN IF EXISTS transaction_no
    `);
    await queryRunner.query(`
      ALTER TABLE inventory.material_disbursement_packages
        DROP CONSTRAINT IF EXISTS fk_material_disbursement_packages_reversed_by,
        DROP COLUMN IF EXISTS reversed_by,
        DROP COLUMN IF EXISTS reversed_at,
        DROP COLUMN IF EXISTS fifo_order
    `);
    await queryRunner.query(`
      ALTER TABLE inventory.materials_disbursements
        DROP CONSTRAINT IF EXISTS fk_materials_disbursements_approved_by,
        DROP CONSTRAINT IF EXISTS fk_materials_disbursements_department,
        DROP COLUMN IF EXISTS approved_by,
        DROP COLUMN IF EXISTS requested_by,
        DROP COLUMN IF EXISTS reference_no,
        DROP COLUMN IF EXISTS production_order,
        DROP COLUMN IF EXISTS department_id,
        DROP COLUMN IF EXISTS trace_id
    `);
    await queryRunner.query(
      `DROP INDEX IF EXISTS inventory.uq_material_receivings_trace_id`,
    );
    await queryRunner.query(`
      ALTER TABLE inventory.material_receivings DROP COLUMN IF EXISTS trace_id
    `);
  }
}
