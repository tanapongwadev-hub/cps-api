import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Materials Receiving — รับเข้าวัตถุดิบ
 *
 * เพิ่มตาราง 5 ตารางใน schema `inventory`:
 *  - material_receivings              หัวเอกสารรับเข้า (1 material ต่อ 1 ใบรับ)
 *  - material_receiving_packages      รายละเอียดแต่ละบรรจุภัณฑ์
 *  - stock_balances                   ยอดคงเหลือต่อ Material (snapshot ล่าสุด)
 *  - stock_transactions               ประวัติการเคลื่อนไหวสต็อก
 *  - material_receiving_lot_counters  ตัวรันเลข lot ภายใน (CCI-YYYYMMDD-XXX) reset รายวัน
 *
 * หมายเหตุ
 *  - ตาราง material_receivings เก็บข้อมูลเป็น single material per receiving
 *    ซึ่งต่างจาก goods_receipts ที่เป็น multi-line เอกสาร
 *  - internal_lot_no มี UNIQUE constraint เพื่อกันการสร้าง lot ซ้ำ
 *    และใช้ material_receiving_lot_counters (lock แบบ SELECT FOR UPDATE)
 *    เพื่อจัดสรร running number ที่ทนต่อ concurrent request
 *  - packing_quantity snapshot เก็นไว้ในตาราง receiving เพื่อกันไม่ให้ยอด
 *    เพี้ยนเมื่อ master.materials.packing_quantity เปลี่ยนในอนาคต
 *  - QR Code เก็บเป็น base64 PNG ในคอลัมน์ qr_code และ payload เป็น JSONB
 *    ในคอลัมน์ qr_payload เพื่อให้สามารถ scan แล้วค้นหากลับมาได้
 */
export class CreateMaterialsReceiving1786197666076 implements MigrationInterface {
  name = 'CreateMaterialsReceiving1786197666076';

  async up(queryRunner: QueryRunner): Promise<void> {
    // -----------------------------------------------------------------
    // 1) Lot counter — running number รายวัน
    // -----------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE inventory.material_receiving_lot_counters (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        lot_date DATE NOT NULL,
        last_number INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uq_material_receiving_lot_counters_date
          UNIQUE (lot_date)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_material_receiving_lot_counters_date
        ON inventory.material_receiving_lot_counters(lot_date)
    `);

    // -----------------------------------------------------------------
    // 2) Stock balance — ยอดคงเหลือต่อ Material (snapshot)
    // -----------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE inventory.stock_balances (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        material_id BIGINT NOT NULL,
        quantity NUMERIC(18,4) NOT NULL DEFAULT 0,
        last_movement_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uq_stock_balances_material
          UNIQUE (material_id),
        CONSTRAINT chk_stock_balances_qty_non_negative
          CHECK (quantity >= 0),
        CONSTRAINT fk_stock_balances_material
          FOREIGN KEY (material_id)
          REFERENCES master.materials(id) ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_stock_balances_material_id
        ON inventory.stock_balances(material_id)
    `);

    // -----------------------------------------------------------------
    // 3) Material receiving — หัวเอกสารรับเข้า
    // -----------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE inventory.material_receivings (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        internal_lot_no VARCHAR(30) NOT NULL,
        organization_id BIGINT NOT NULL,
        supplier_id BIGINT NOT NULL,
        material_id BIGINT NOT NULL,
        unit_id BIGINT NOT NULL,
        receive_quantity NUMERIC(18,4) NOT NULL,
        packing_quantity INTEGER NOT NULL,
        package_count INTEGER NOT NULL,
        supplier_lot_no VARCHAR(30),
        supplier_production_date DATE,
        receive_date DATE NOT NULL,
        qr_code TEXT,
        qr_payload JSONB,
        status VARCHAR(20) NOT NULL DEFAULT 'draft',
        idempotency_key VARCHAR(80),
        remark TEXT,
        confirmed_by BIGINT,
        confirmed_at TIMESTAMP,
        cancelled_by BIGINT,
        cancelled_at TIMESTAMP,
        cancel_reason TEXT,
        created_by BIGINT,
        updated_by BIGINT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uq_material_receivings_internal_lot_no
          UNIQUE (internal_lot_no),
        CONSTRAINT chk_material_receivings_status
          CHECK (status IN ('draft', 'confirmed', 'cancelled')),
        CONSTRAINT chk_material_receivings_qty_positive
          CHECK (receive_quantity > 0),
        CONSTRAINT chk_material_receivings_packing_positive
          CHECK (packing_quantity > 0),
        CONSTRAINT chk_material_receivings_package_count_positive
          CHECK (package_count > 0),
        CONSTRAINT chk_material_receivings_package_count_fit
          CHECK (package_count >= CEIL(receive_quantity / packing_quantity)),
        CONSTRAINT chk_material_receivings_confirmed_fields
          CHECK (
            (status <> 'confirmed' AND status <> 'cancelled')
            OR (confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL)
          ),
        CONSTRAINT chk_material_receivings_cancelled_fields
          CHECK (
            status <> 'cancelled'
            OR (cancelled_by IS NOT NULL AND cancelled_at IS NOT NULL AND cancel_reason IS NOT NULL)
          ),
        CONSTRAINT fk_material_receivings_organization
          FOREIGN KEY (organization_id)
          REFERENCES master.organizations(id) ON DELETE RESTRICT,
        CONSTRAINT fk_material_receivings_supplier
          FOREIGN KEY (supplier_id)
          REFERENCES master.suppliers(id) ON DELETE RESTRICT,
        CONSTRAINT fk_material_receivings_material
          FOREIGN KEY (material_id)
          REFERENCES master.materials(id) ON DELETE RESTRICT,
        CONSTRAINT fk_material_receivings_unit
          FOREIGN KEY (unit_id)
          REFERENCES master.units(id) ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_material_receivings_idempotency_key
        ON inventory.material_receivings(idempotency_key)
        WHERE idempotency_key IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX idx_material_receivings_organization_id
        ON inventory.material_receivings(organization_id)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_material_receivings_supplier_id
        ON inventory.material_receivings(supplier_id)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_material_receivings_material_id
        ON inventory.material_receivings(material_id)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_material_receivings_receive_date
        ON inventory.material_receivings(receive_date)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_material_receivings_status
        ON inventory.material_receivings(status)
    `);

    // -----------------------------------------------------------------
    // 4) Material receiving package — รายละเอียดแต่ละบรรจุภัณฑ์
    // -----------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE inventory.material_receiving_packages (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        material_receiving_id BIGINT NOT NULL,
        package_no INTEGER NOT NULL,
        quantity NUMERIC(18,4) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uq_material_receiving_packages_line
          UNIQUE (material_receiving_id, package_no),
        CONSTRAINT chk_material_receiving_packages_qty_positive
          CHECK (quantity > 0),
        CONSTRAINT chk_material_receiving_packages_no_positive
          CHECK (package_no > 0),
        CONSTRAINT fk_material_receiving_packages_receiving
          FOREIGN KEY (material_receiving_id)
          REFERENCES inventory.material_receivings(id) ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_material_receiving_packages_receiving_id
        ON inventory.material_receiving_packages(material_receiving_id)
    `);

    // -----------------------------------------------------------------
    // 5) Stock transaction — ประวัติการเคลื่อนไหวสต็อก
    // -----------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE inventory.stock_transactions (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        material_id BIGINT NOT NULL,
        transaction_type VARCHAR(30) NOT NULL,
        reference_type VARCHAR(40) NOT NULL,
        reference_id BIGINT,
        reference_lot_no VARCHAR(40),
        quantity_before NUMERIC(18,4) NOT NULL,
        quantity_in NUMERIC(18,4) NOT NULL DEFAULT 0,
        quantity_out NUMERIC(18,4) NOT NULL DEFAULT 0,
        quantity_after NUMERIC(18,4) NOT NULL,
        transaction_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        remark TEXT,
        created_by BIGINT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT chk_stock_transactions_type
          CHECK (transaction_type IN ('RECEIVE', 'ISSUE', 'ADJUST')),
        CONSTRAINT chk_stock_transactions_ref_type
          CHECK (reference_type IN ('MATERIAL_RECEIVING')),
        CONSTRAINT chk_stock_transactions_qty_sign
          CHECK (quantity_before >= 0 AND quantity_in >= 0 AND quantity_out >= 0 AND quantity_after >= 0),
        CONSTRAINT chk_stock_transactions_in_or_out
          CHECK (
            (quantity_in > 0 AND quantity_out = 0)
            OR (quantity_out > 0 AND quantity_in = 0)
            OR (quantity_in = 0 AND quantity_out = 0)
          ),
        CONSTRAINT chk_stock_transactions_after
          CHECK (quantity_after = quantity_before + quantity_in - quantity_out),
        CONSTRAINT fk_stock_transactions_material
          FOREIGN KEY (material_id)
          REFERENCES master.materials(id) ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_stock_transactions_material_id
        ON inventory.stock_transactions(material_id)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_stock_transactions_transaction_date
        ON inventory.stock_transactions(transaction_date)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_stock_transactions_reference
        ON inventory.stock_transactions(reference_type, reference_id)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_stock_transactions_lot_no
        ON inventory.stock_transactions(reference_lot_no)
        WHERE reference_lot_no IS NOT NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS inventory.stock_transactions`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS inventory.material_receiving_packages`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS inventory.material_receivings`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS inventory.stock_balances`);
    await queryRunner.query(
      `DROP TABLE IF EXISTS inventory.material_receiving_lot_counters`,
    );
  }
}
