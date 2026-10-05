import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Production Lot & QR traceability — Phase 1 (schema only).
 * Plan: admin-dashboard/docs/plans/2026-10-05-production-lot-traceability-plan.md
 *
 * - Lots at every workflow step (ORIGIN at the first step, PROCESS in between,
 *   FG/STORE at a receiving step), many-to-many lineage between lots.
 * - Origin composition is materialized on every quantity bucket (WIP, lot,
 *   transaction, package) so each piece stays traceable to its first-step lot
 *   even after lots are merged, split or partly consumed.
 * - One lot per order line / step / production date / shift while open
 *   (`output_closed_at IS NULL`).
 * - Append-only ledger: transactions, lineage and package composition cannot
 *   be updated; nothing in this model can be deleted (corrections are
 *   REVERSAL/ADJUSTMENT transactions).
 *
 * Additive only. Existing production orders keep the packet model
 * (`tracking_model = 'PACKET'`); the column default switches to 'LOT' in
 * Phase 2 when order creation starts using lots.
 */
export class CreateProductionLotTraceability1790600000008 implements MigrationInterface {
  name = 'CreateProductionLotTraceability1790600000008';

  async up(q: QueryRunner): Promise<void> {
    // ---- master / existing tables -------------------------------------
    await q.query(`
      ALTER TABLE master.process_steps
        ADD COLUMN receiving_type varchar(10) NOT NULL DEFAULT 'NONE'
          CHECK (receiving_type IN ('NONE','FG','STORE'))`);
    await q.query(
      `UPDATE master.process_steps SET receiving_type = 'FG' WHERE code = 'INCOME-FG'`,
    );
    await q.query(
      `UPDATE master.process_steps SET receiving_type = 'STORE' WHERE code = 'INCOME-STORE'`,
    );

    await q.query(`
      ALTER TABLE inventory.production_orders
        ADD COLUMN tracking_model varchar(10) NOT NULL DEFAULT 'PACKET'
          CHECK (tracking_model IN ('PACKET','LOT'))`);

    await q.query(`
      ALTER TABLE inventory.production_order_lines
        ADD COLUMN produced_qty int NOT NULL DEFAULT 0 CHECK (produced_qty >= 0),
        ADD COLUMN received_qty int NOT NULL DEFAULT 0 CHECK (received_qty >= 0),
        ADD COLUMN rejected_qty int NOT NULL DEFAULT 0 CHECK (rejected_qty >= 0)`);

    // ---- lots ------------------------------------------------------------
    await q.query(`
      CREATE TABLE inventory.production_lots (
        id bigserial PRIMARY KEY,
        lot_no varchar(60) NOT NULL UNIQUE,
        production_order_id bigint NOT NULL REFERENCES inventory.production_orders(id),
        production_order_line_id bigint NOT NULL REFERENCES inventory.production_order_lines(id),
        product_id bigint NOT NULL REFERENCES master.products(id),
        step_index int NOT NULL CHECK (step_index >= 0),
        process_step_id bigint NOT NULL REFERENCES master.process_steps(id),
        process_code varchar(50) NOT NULL,
        lot_type varchar(10) NOT NULL CHECK (lot_type IN ('ORIGIN','PROCESS','FG','STORE')),
        produced_qty int NOT NULL CHECK (produced_qty > 0),
        remaining_qty int NOT NULL CHECK (remaining_qty >= 0 AND remaining_qty <= produced_qty),
        production_date date NOT NULL,
        shift_key varchar(20) NOT NULL DEFAULT '',
        status varchar(12) NOT NULL DEFAULT 'OPEN'
          CHECK (status IN ('OPEN','CONSUMED','REVERSED')),
        output_closed_at timestamptz NULL,
        created_by bigint NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`);
    await q.query(`
      CREATE UNIQUE INDEX uq_production_lots_open_bucket
        ON inventory.production_lots (production_order_line_id, step_index, production_date, shift_key)
        WHERE output_closed_at IS NULL`);
    await q.query(
      `CREATE INDEX idx_production_lots_line_step ON inventory.production_lots (production_order_line_id, step_index, status)`,
    );
    await q.query(
      `CREATE INDEX idx_production_lots_order ON inventory.production_lots (production_order_id)`,
    );

    await q.query(`
      CREATE TABLE inventory.production_lot_counters (
        prefix varchar(20) NOT NULL,
        lot_date date NOT NULL,
        last_seq int NOT NULL CHECK (last_seq > 0),
        PRIMARY KEY (prefix, lot_date)
      )`);

    // ---- WIP ---------------------------------------------------------------
    await q.query(`
      CREATE TABLE inventory.process_wip (
        id bigserial PRIMARY KEY,
        production_order_id bigint NOT NULL REFERENCES inventory.production_orders(id),
        production_order_line_id bigint NOT NULL REFERENCES inventory.production_order_lines(id),
        step_index int NOT NULL CHECK (step_index >= 0),
        process_step_id bigint NOT NULL REFERENCES master.process_steps(id),
        source_lot_id bigint NULL REFERENCES inventory.production_lots(id),
        qty_in int NOT NULL CHECK (qty_in > 0),
        qty_used int NOT NULL DEFAULT 0 CHECK (qty_used >= 0),
        qty_rejected int NOT NULL DEFAULT 0 CHECK (qty_rejected >= 0),
        qty_closed int NOT NULL DEFAULT 0 CHECK (qty_closed >= 0),
        qty_remaining int NOT NULL CHECK (qty_remaining >= 0),
        received_at timestamptz NOT NULL,
        status varchar(10) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','DONE')),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT chk_process_wip_balance
          CHECK (qty_remaining = qty_in - qty_used - qty_rejected - qty_closed)
      )`);
    await q.query(`
      CREATE INDEX idx_process_wip_fifo
        ON inventory.process_wip (production_order_line_id, step_index, status, received_at, id)`);
    await q.query(
      `CREATE INDEX idx_process_wip_source ON inventory.process_wip (source_lot_id)`,
    );

    // ---- ledger --------------------------------------------------------------
    await q.query(`
      CREATE TABLE inventory.production_transactions (
        id bigserial PRIMARY KEY,
        request_id uuid NOT NULL,
        production_order_id bigint NOT NULL REFERENCES inventory.production_orders(id),
        production_order_line_id bigint NOT NULL REFERENCES inventory.production_order_lines(id),
        step_index int NOT NULL CHECK (step_index >= 0),
        process_step_id bigint NOT NULL REFERENCES master.process_steps(id),
        transaction_type varchar(20) NOT NULL CHECK (transaction_type IN
          ('PLAN_RELEASE','PROCESS_IN','PROCESS_OUTPUT','REJECT','TRANSFER','SPLIT','MERGE',
           'FG_RECEIVE','PACKING','SHORT_CLOSE','ADJUSTMENT','REVERSAL')),
        source_lot_id bigint NULL REFERENCES inventory.production_lots(id),
        target_lot_id bigint NULL REFERENCES inventory.production_lots(id),
        source_wip_id bigint NULL REFERENCES inventory.process_wip(id),
        target_wip_id bigint NULL REFERENCES inventory.process_wip(id),
        package_id bigint NULL,
        qty int NOT NULL CHECK (qty <> 0),
        reject_reason_id bigint NULL REFERENCES master.reject_reasons(id),
        transaction_date date NOT NULL,
        shift_key varchar(20) NOT NULL DEFAULT '',
        allocation_mode varchar(10) NULL CHECK (allocation_mode IN ('FIFO','MANUAL')),
        reverses_transaction_id bigint NULL REFERENCES inventory.production_transactions(id),
        remark varchar(500) NULL,
        operator_id bigint NULL,
        correlation_id varchar(100) NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT chk_production_tx_sign
          CHECK (qty > 0 OR transaction_type IN ('ADJUSTMENT','REVERSAL'))
      )`);
    await q.query(`
      CREATE UNIQUE INDEX uq_production_tx_idempotency ON inventory.production_transactions
        (request_id, transaction_type, COALESCE(source_wip_id, 0), COALESCE(source_lot_id, 0),
         COALESCE(target_lot_id, 0), COALESCE(package_id, 0))`);
    await q.query(`
      CREATE INDEX idx_production_tx_line_step_date
        ON inventory.production_transactions (production_order_line_id, step_index, transaction_date)`);
    await q.query(
      `CREATE INDEX idx_production_tx_source_lot ON inventory.production_transactions (source_lot_id)`,
    );
    await q.query(
      `CREATE INDEX idx_production_tx_target_lot ON inventory.production_transactions (target_lot_id)`,
    );

    // ---- lineage + origin composition ------------------------------------------
    await q.query(`
      CREATE TABLE inventory.production_lot_sources (
        id bigserial PRIMARY KEY,
        target_lot_id bigint NOT NULL REFERENCES inventory.production_lots(id),
        source_lot_id bigint NOT NULL REFERENCES inventory.production_lots(id),
        qty int NOT NULL CHECK (qty > 0),
        transaction_id bigint NOT NULL REFERENCES inventory.production_transactions(id),
        created_at timestamptz NOT NULL DEFAULT now(),
        CHECK (target_lot_id <> source_lot_id)
      )`);
    await q.query(
      `CREATE INDEX idx_lot_sources_target ON inventory.production_lot_sources (target_lot_id)`,
    );
    await q.query(
      `CREATE INDEX idx_lot_sources_source ON inventory.production_lot_sources (source_lot_id)`,
    );

    await q.query(`
      CREATE TABLE inventory.production_lot_origins (
        lot_id bigint NOT NULL REFERENCES inventory.production_lots(id),
        origin_lot_id bigint NOT NULL REFERENCES inventory.production_lots(id),
        qty int NOT NULL CHECK (qty > 0),
        qty_remaining int NOT NULL CHECK (qty_remaining >= 0 AND qty_remaining <= qty),
        PRIMARY KEY (lot_id, origin_lot_id)
      )`);
    await q.query(
      `CREATE INDEX idx_lot_origins_origin ON inventory.production_lot_origins (origin_lot_id)`,
    );

    await q.query(`
      CREATE TABLE inventory.process_wip_origins (
        wip_id bigint NOT NULL REFERENCES inventory.process_wip(id),
        origin_lot_id bigint NOT NULL REFERENCES inventory.production_lots(id),
        qty int NOT NULL CHECK (qty > 0),
        qty_remaining int NOT NULL CHECK (qty_remaining >= 0 AND qty_remaining <= qty),
        PRIMARY KEY (wip_id, origin_lot_id)
      )`);

    await q.query(`
      CREATE TABLE inventory.production_transaction_origins (
        transaction_id bigint NOT NULL REFERENCES inventory.production_transactions(id),
        origin_lot_id bigint NOT NULL REFERENCES inventory.production_lots(id),
        qty int NOT NULL CHECK (qty <> 0),
        PRIMARY KEY (transaction_id, origin_lot_id)
      )`);

    // ---- packages (QR at the receiving step) ------------------------------------
    await q.query(`
      CREATE TABLE inventory.production_packages (
        id bigserial PRIMARY KEY,
        qr_code varchar(80) NOT NULL UNIQUE,
        production_order_id bigint NOT NULL REFERENCES inventory.production_orders(id),
        production_order_line_id bigint NOT NULL REFERENCES inventory.production_order_lines(id),
        product_id bigint NOT NULL REFERENCES master.products(id),
        fg_lot_id bigint NOT NULL REFERENCES inventory.production_lots(id),
        box_no int NOT NULL CHECK (box_no > 0),
        unit_type varchar(10) NOT NULL CHECK (unit_type IN ('FULL','PARTIAL')),
        initial_qty int NOT NULL CHECK (initial_qty > 0),
        current_qty int NOT NULL CHECK (current_qty >= 0 AND current_qty <= initial_qty),
        status varchar(12) NOT NULL DEFAULT 'PACKED'
          CHECK (status IN ('PACKED','STORED','SHIPPED','VOID')),
        print_count int NOT NULL DEFAULT 0 CHECK (print_count >= 0),
        created_by bigint NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (fg_lot_id, box_no)
      )`);
    await q.query(`
      ALTER TABLE inventory.production_transactions
        ADD CONSTRAINT fk_production_tx_package
        FOREIGN KEY (package_id) REFERENCES inventory.production_packages(id)`);

    await q.query(`
      CREATE TABLE inventory.production_package_sources (
        package_id bigint NOT NULL REFERENCES inventory.production_packages(id),
        origin_lot_id bigint NOT NULL REFERENCES inventory.production_lots(id),
        qty int NOT NULL CHECK (qty > 0),
        PRIMARY KEY (package_id, origin_lot_id)
      )`);

    // ---- integrity guards -------------------------------------------------------
    await q.query(`
      CREATE FUNCTION inventory.production_trace_forbid_change() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'ข้อมูล % แก้ไขหรือลบไม่ได้ (ใช้รายการกลับรายการแทน)', TG_TABLE_NAME
          USING ERRCODE = 'integrity_constraint_violation';
      END $$`);
    // No deletes anywhere in the lot model.
    for (const table of NO_DELETE_TABLES) {
      await q.query(`
        CREATE TRIGGER trg_${table}_no_delete BEFORE DELETE ON inventory.${table}
        FOR EACH ROW EXECUTE FUNCTION inventory.production_trace_forbid_change()`);
    }
    // Ledger-type tables are also immutable.
    for (const table of NO_UPDATE_TABLES) {
      await q.query(`
        CREATE TRIGGER trg_${table}_no_update BEFORE UPDATE ON inventory.${table}
        FOR EACH ROW EXECUTE FUNCTION inventory.production_trace_forbid_change()`);
    }
  }

  async down(q: QueryRunner): Promise<void> {
    for (const table of [...NO_UPDATE_TABLES]) {
      await q.query(
        `DROP TRIGGER IF EXISTS trg_${table}_no_update ON inventory.${table}`,
      );
    }
    for (const table of NO_DELETE_TABLES) {
      await q.query(
        `DROP TRIGGER IF EXISTS trg_${table}_no_delete ON inventory.${table}`,
      );
    }
    await q.query(
      `DROP FUNCTION IF EXISTS inventory.production_trace_forbid_change()`,
    );
    for (const table of [
      'production_package_sources',
      'production_transaction_origins',
      'process_wip_origins',
      'production_lot_origins',
      'production_lot_sources',
    ]) {
      await q.query(`DROP TABLE IF EXISTS inventory.${table}`);
    }
    await q.query(
      `ALTER TABLE inventory.production_transactions DROP CONSTRAINT IF EXISTS fk_production_tx_package`,
    );
    for (const table of [
      'production_packages',
      'production_transactions',
      'process_wip',
      'production_lot_counters',
      'production_lots',
    ]) {
      await q.query(`DROP TABLE IF EXISTS inventory.${table}`);
    }
    await q.query(`
      ALTER TABLE inventory.production_order_lines
        DROP COLUMN rejected_qty, DROP COLUMN received_qty, DROP COLUMN produced_qty`);
    await q.query(
      `ALTER TABLE inventory.production_orders DROP COLUMN tracking_model`,
    );
    await q.query(
      `ALTER TABLE master.process_steps DROP COLUMN receiving_type`,
    );
  }
}

const NO_DELETE_TABLES = [
  'production_lots',
  'production_lot_sources',
  'production_lot_origins',
  'process_wip',
  'process_wip_origins',
  'production_transactions',
  'production_transaction_origins',
  'production_packages',
  'production_package_sources',
];

const NO_UPDATE_TABLES = [
  'production_lot_sources',
  'production_transactions',
  'production_transaction_origins',
  'production_package_sources',
];
