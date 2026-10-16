import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sales: sales orders → sales job orders (FIFO reservation of packed FG boxes)
 * → scan-pick → stock issue (shipments) → sales report.
 *
 * Also links packed FG boxes to the finished-product stock ledger: every
 * product box packed from now on is received into
 * `inventory.product_stock_movements`, and this migration backfills one
 * receipt per already-packed product box (skipped when a ledger row with the
 * box QR as reference already exists, so a re-run never double-counts).
 */
const MENUS = [
  // code, parent code, name_th, name_en, menu_type, path, icon
  ['SALES', null, 'การขายและจัดส่ง', 'Sales & Delivery', 'MAIN', null, 'shopping-cart'],
  ['SALES_ORDERS', 'SALES', 'ออเดอร์ขาย', 'Sales Orders', 'SUB', '/sales/orders', 'receipt'],
  ['SALES_JOB_ORDERS', 'SALES', 'ใบจัดงานขาย / ตัดสต็อก', 'Sales Job Orders', 'SUB', '/sales/job-orders', 'package-check'],
  ['SALES_REPORT', 'REPORTS_AUDIT', 'รายงานการขาย', 'Sales Report', 'SUB', '/reports/sales', 'chart-column'],
] as const;

const PERMISSIONS = [
  ['SALES_ORDERS', 'READ', 'SALES_ORDER_VIEW'],
  ['SALES_ORDERS', 'CREATE', 'SALES_ORDER_CREATE'],
  ['SALES_ORDERS', 'UPDATE', 'SALES_ORDER_UPDATE'],
  ['SALES_ORDERS', 'DELETE', 'SALES_ORDER_DELETE'],
  ['SALES_ORDERS', 'APPROVE', 'SALES_ORDER_CONFIRM'],
  ['SALES_ORDERS', 'CANCEL', 'SALES_ORDER_CANCEL'],
  ['SALES_JOB_ORDERS', 'READ', 'SALES_JOB_ORDER_VIEW'],
  ['SALES_JOB_ORDERS', 'PRINT', 'SALES_JOB_ORDER_PRINT'],
  ['SALES_JOB_ORDERS', 'PICK', 'SALES_JOB_ORDER_PICK'],
  ['SALES_JOB_ORDERS', 'ISSUE', 'SALES_JOB_ORDER_ISSUE'],
  ['SALES_REPORT', 'READ', 'SALES_REPORT_VIEW'],
] as const;

export class CreateSalesModule1790600000032 implements MigrationInterface {
  name = 'CreateSalesModule1790600000032';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE inventory.sales_orders (
        id bigserial PRIMARY KEY,
        code varchar(30) NOT NULL UNIQUE,
        customer_id bigint NOT NULL REFERENCES master.customers(id) ON DELETE RESTRICT,
        order_date date NOT NULL,
        due_date date NULL,
        customer_po varchar(100) NULL,
        remark varchar(1000) NULL,
        status varchar(20) NOT NULL DEFAULT 'DRAFT'
          CHECK (status IN ('DRAFT','CONFIRMED','PARTIALLY_SHIPPED','SHIPPED','CANCELLED')),
        version int NOT NULL DEFAULT 1,
        confirmed_at timestamptz NULL,
        confirmed_by bigint NULL REFERENCES iam.users(id),
        cancelled_at timestamptz NULL,
        cancelled_by bigint NULL REFERENCES iam.users(id),
        cancel_reason varchar(500) NULL,
        created_by bigint NULL REFERENCES iam.users(id),
        updated_by bigint NULL REFERENCES iam.users(id),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`);
    await q.query(`CREATE INDEX idx_sales_orders_status ON inventory.sales_orders(status, order_date)`);
    await q.query(`CREATE INDEX idx_sales_orders_customer ON inventory.sales_orders(customer_id)`);

    await q.query(`
      CREATE TABLE inventory.sales_order_lines (
        id bigserial PRIMARY KEY,
        sales_order_id bigint NOT NULL REFERENCES inventory.sales_orders(id) ON DELETE CASCADE,
        line_no int NOT NULL CHECK (line_no > 0),
        product_id bigint NOT NULL REFERENCES master.products(id) ON DELETE RESTRICT,
        quantity int NOT NULL CHECK (quantity > 0),
        shipped_quantity int NOT NULL DEFAULT 0
          CHECK (shipped_quantity >= 0 AND shipped_quantity <= quantity),
        remark varchar(500) NULL,
        UNIQUE (sales_order_id, product_id),
        UNIQUE (sales_order_id, line_no)
      )`);

    await q.query(`
      CREATE TABLE inventory.sales_job_orders (
        id bigserial PRIMARY KEY,
        code varchar(30) NOT NULL UNIQUE,
        sales_order_id bigint NOT NULL UNIQUE REFERENCES inventory.sales_orders(id) ON DELETE RESTRICT,
        status varchar(20) NOT NULL
          CHECK (status IN ('WAITING_PICKING','READY_TO_ISSUE','PARTIALLY_ISSUED','ISSUED','CANCELLED')),
        version int NOT NULL DEFAULT 1,
        print_count int NOT NULL DEFAULT 0 CHECK (print_count >= 0),
        printed_at timestamptz NULL,
        printed_by bigint NULL REFERENCES iam.users(id),
        completed_at timestamptz NULL,
        cancelled_at timestamptz NULL,
        cancelled_by bigint NULL REFERENCES iam.users(id),
        cancel_reason varchar(500) NULL,
        created_by bigint NULL REFERENCES iam.users(id),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`);

    await q.query(`
      CREATE TABLE inventory.sales_job_order_reservations (
        id bigserial PRIMARY KEY,
        sales_job_order_id bigint NOT NULL REFERENCES inventory.sales_job_orders(id) ON DELETE RESTRICT,
        sales_order_line_id bigint NOT NULL REFERENCES inventory.sales_order_lines(id) ON DELETE RESTRICT,
        package_id bigint NOT NULL REFERENCES inventory.production_packages(id) ON DELETE RESTRICT,
        reserved_qty int NOT NULL CHECK (reserved_qty > 0),
        issued_qty int NOT NULL DEFAULT 0 CHECK (issued_qty >= 0 AND issued_qty <= reserved_qty),
        picked_at timestamptz NULL,
        picked_by bigint NULL REFERENCES iam.users(id),
        released_at timestamptz NULL,
        release_type varchar(12) NULL CHECK (release_type IN ('ISSUED','CANCELLED')),
        created_at timestamptz NOT NULL DEFAULT now(),
        CHECK ((released_at IS NULL) = (release_type IS NULL))
      )`);
    await q.query(`CREATE INDEX idx_sales_reservations_job ON inventory.sales_job_order_reservations(sales_job_order_id)`);
    await q.query(`CREATE INDEX idx_sales_reservations_active_package
      ON inventory.sales_job_order_reservations(package_id) WHERE released_at IS NULL`);

    // Append-only issue ledger — the source of truth for the sales report.
    await q.query(`
      CREATE TABLE inventory.sales_shipments (
        id bigserial PRIMARY KEY,
        request_id uuid NOT NULL,
        issue_no varchar(30) NOT NULL,
        sales_job_order_id bigint NOT NULL REFERENCES inventory.sales_job_orders(id) ON DELETE RESTRICT,
        sales_order_id bigint NOT NULL REFERENCES inventory.sales_orders(id) ON DELETE RESTRICT,
        sales_order_line_id bigint NOT NULL REFERENCES inventory.sales_order_lines(id) ON DELETE RESTRICT,
        reservation_id bigint NOT NULL REFERENCES inventory.sales_job_order_reservations(id) ON DELETE RESTRICT,
        package_id bigint NOT NULL REFERENCES inventory.production_packages(id) ON DELETE RESTRICT,
        product_id bigint NOT NULL REFERENCES master.products(id) ON DELETE RESTRICT,
        customer_id bigint NOT NULL REFERENCES master.customers(id) ON DELETE RESTRICT,
        qty int NOT NULL CHECK (qty > 0),
        issue_date date NOT NULL,
        issued_by bigint NOT NULL REFERENCES iam.users(id),
        issued_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (request_id, reservation_id)
      )`);
    await q.query(`CREATE INDEX idx_sales_shipments_date ON inventory.sales_shipments(issue_date)`);
    await q.query(`CREATE INDEX idx_sales_shipments_issue_no ON inventory.sales_shipments(issue_no)`);
    await q.query(`
      CREATE TRIGGER trg_sales_shipments_no_update BEFORE UPDATE OR DELETE ON inventory.sales_shipments
      FOR EACH ROW EXECUTE FUNCTION inventory.production_trace_forbid_change()`);

    // ---- FG boxes → finished-product stock ledger backfill ----------------------
    await q.query(`
      INSERT INTO inventory.product_stock_movements
        (product_id, request_id, type, quantity, balance_after, reference_no, remark, recorded_by, created_at)
      SELECT p.product_id, gen_random_uuid(), 'receive', p.current_qty,
             SUM(p.current_qty) OVER (PARTITION BY p.product_id ORDER BY p.id)
               + COALESCE((SELECT SUM(CASE WHEN m.type='receive' THEN m.quantity ELSE -m.quantity END)
                           FROM inventory.product_stock_movements m WHERE m.product_id = p.product_id), 0),
             p.qr_code, 'ยอดตั้งต้นจากกล่อง FG ที่แพ็กแล้ว', p.created_by, now()
      FROM inventory.production_packages p
      WHERE p.product_id IS NOT NULL AND p.status = 'PACKED' AND p.current_qty > 0
        AND p.created_by IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM inventory.product_stock_movements m
                        WHERE m.product_id = p.product_id AND m.reference_no = p.qr_code)
      ORDER BY p.id`);

    // ---- menus / permissions ----------------------------------------------------
    // New MAIN root sits before รายงานและตรวจสอบ.
    await q.query(`UPDATE iam.menus SET sort_order = sort_order + 1
                   WHERE parent_id IS NULL AND sort_order >= 5`);
    for (const [code, parent, nameTh, nameEn, type, path, icon] of MENUS) {
      const sort = parent === null
        ? 5
        : Number(((await q.query(
            `SELECT COALESCE(MAX(m.sort_order), -1) + 1 AS next
             FROM iam.menus m JOIN iam.menus p ON p.id = m.parent_id WHERE p.code = $1`,
            [parent],
          )) as Array<{ next: number }>)[0].next);
      await q.query(
        `INSERT INTO iam.menus (code, name_th, name_en, menu_type, path, icon, sort_order, parent_id,
                                is_visible, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, (SELECT id FROM iam.menus WHERE code = $8),
                 true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON CONFLICT (code) DO NOTHING`,
        [code, nameTh, nameEn, type, path, icon, sort, parent],
      );
    }
    for (const [menu, action, code] of PERMISSIONS) {
      await q.query(
        `INSERT INTO iam.permissions (menu_id, action_id, code, description, is_active, created_at, updated_at)
         SELECT menu.id, action.id, $3, menu.name_th || ' — ' || $2, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
         FROM iam.menus menu CROSS JOIN iam.actions action
         WHERE menu.code = $1 AND action.code = $2
         ON CONFLICT (code) DO NOTHING`,
        [menu, action, code],
      );
    }
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DELETE FROM iam.permissions WHERE code LIKE 'SALES\\_%'`);
    await q.query(`DELETE FROM iam.menus WHERE code IN ('SALES_ORDERS','SALES_JOB_ORDERS','SALES_REPORT')`);
    await q.query(`DELETE FROM iam.menus WHERE code = 'SALES'`);
    await q.query(`UPDATE iam.menus SET sort_order = sort_order - 1 WHERE parent_id IS NULL AND sort_order > 5`);
    await q.query(`DROP TABLE IF EXISTS inventory.sales_shipments`);
    await q.query(`DROP TABLE IF EXISTS inventory.sales_job_order_reservations`);
    await q.query(`DROP TABLE IF EXISTS inventory.sales_job_orders`);
    await q.query(`DROP TABLE IF EXISTS inventory.sales_order_lines`);
    await q.query(`DROP TABLE IF EXISTS inventory.sales_orders`);
    // Backfilled ledger receipts are kept: they describe real packed stock.
  }
}
