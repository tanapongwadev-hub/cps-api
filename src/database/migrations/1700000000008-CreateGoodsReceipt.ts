import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateGoodsReceipt1700000000008 implements MigrationInterface {
  name = 'CreateGoodsReceipt1700000000008';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS inventory`);

    await queryRunner.query(`
      CREATE TABLE master.reject_reasons (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        code VARCHAR(50) UNIQUE NOT NULL,
        name_th VARCHAR(100) NOT NULL,
        name_en VARCHAR(100),
        description TEXT,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_by BIGINT,
        updated_by BIGINT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await queryRunner.query(`
      CREATE TABLE inventory.document_counters (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        organization_id BIGINT NOT NULL,
        doc_type VARCHAR(30) NOT NULL,
        period VARCHAR(6) NOT NULL,
        last_number INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uq_document_counters_scope
          UNIQUE (organization_id, doc_type, period),
        CONSTRAINT fk_document_counters_organization
          FOREIGN KEY (organization_id)
          REFERENCES master.organizations(id) ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE TABLE inventory.goods_receipts (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        receipt_no VARCHAR(30),
        organization_id BIGINT NOT NULL,
        supplier_id BIGINT NOT NULL,
        receipt_date DATE NOT NULL,
        po_no VARCHAR(50),
        supplier_doc_no VARCHAR(50),
        supplier_doc_date DATE,
        no_supplier_document BOOLEAN NOT NULL DEFAULT false,
        status VARCHAR(20) NOT NULL DEFAULT 'draft',
        remark TEXT,
        posted_by BIGINT,
        posted_at TIMESTAMP,
        cancelled_by BIGINT,
        cancelled_at TIMESTAMP,
        cancel_reason TEXT,
        created_by BIGINT,
        updated_by BIGINT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT chk_goods_receipts_status
          CHECK (status IN ('draft', 'posted', 'cancelled')),
        CONSTRAINT chk_goods_receipts_posted_fields
          CHECK (
            (status <> 'posted' AND status <> 'cancelled')
            OR (receipt_no IS NOT NULL AND posted_by IS NOT NULL AND posted_at IS NOT NULL)
          ),
        CONSTRAINT chk_goods_receipts_cancelled_fields
          CHECK (
            status <> 'cancelled'
            OR (cancelled_by IS NOT NULL AND cancelled_at IS NOT NULL AND cancel_reason IS NOT NULL)
          ),
        CONSTRAINT fk_goods_receipts_organization
          FOREIGN KEY (organization_id)
          REFERENCES master.organizations(id) ON DELETE RESTRICT,
        CONSTRAINT fk_goods_receipts_supplier
          FOREIGN KEY (supplier_id)
          REFERENCES master.suppliers(id) ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE TABLE inventory.goods_receipt_items (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        goods_receipt_id BIGINT NOT NULL,
        line_no INTEGER NOT NULL,
        material_id BIGINT NOT NULL,
        material_code VARCHAR(50),
        material_name VARCHAR(255),
        unit_id BIGINT NOT NULL,
        qty_delivered NUMERIC(18,4) NOT NULL,
        qty_received NUMERIC(18,4) NOT NULL,
        qty_rejected NUMERIC(18,4) NOT NULL DEFAULT 0,
        reject_reason_id BIGINT,
        reject_note TEXT,
        lot_no VARCHAR(50),
        production_date DATE,
        expiry_date DATE,
        unit_price NUMERIC(18,4),
        line_amount NUMERIC(18,4),
        remark TEXT,
        created_by BIGINT,
        updated_by BIGINT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uq_goods_receipt_items_line
          UNIQUE (goods_receipt_id, line_no),
        CONSTRAINT chk_goods_receipt_items_qty_sign
          CHECK (qty_delivered >= 0 AND qty_received >= 0 AND qty_rejected >= 0),
        CONSTRAINT chk_goods_receipt_items_qty_total
          CHECK (qty_received + qty_rejected <= qty_delivered),
        CONSTRAINT chk_goods_receipt_items_qty_not_zero
          CHECK (qty_received > 0 OR qty_rejected > 0),
        CONSTRAINT chk_goods_receipt_items_reject_reason
          CHECK (qty_rejected = 0 OR reject_reason_id IS NOT NULL),
        CONSTRAINT chk_goods_receipt_items_price
          CHECK (
            (unit_price IS NULL OR unit_price >= 0)
            AND (line_amount IS NULL OR line_amount >= 0)
          ),
        CONSTRAINT fk_goods_receipt_items_receipt
          FOREIGN KEY (goods_receipt_id)
          REFERENCES inventory.goods_receipts(id) ON DELETE CASCADE,
        CONSTRAINT fk_goods_receipt_items_material
          FOREIGN KEY (material_id)
          REFERENCES master.materials(id) ON DELETE RESTRICT,
        CONSTRAINT fk_goods_receipt_items_unit
          FOREIGN KEY (unit_id)
          REFERENCES master.units(id) ON DELETE RESTRICT,
        CONSTRAINT fk_goods_receipt_items_reject_reason
          FOREIGN KEY (reject_reason_id)
          REFERENCES master.reject_reasons(id) ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE TABLE inventory.goods_receipt_attachments (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        goods_receipt_id BIGINT NOT NULL,
        doc_type VARCHAR(30) NOT NULL,
        file_path VARCHAR(500) NOT NULL,
        file_name VARCHAR(255) NOT NULL,
        mime_type VARCHAR(100) NOT NULL,
        file_size INTEGER NOT NULL,
        created_by BIGINT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT chk_goods_receipt_attachments_doc_type
          CHECK (doc_type IN ('DELIVERY_NOTE', 'TAX_INVOICE', 'PHOTO', 'OTHER')),
        CONSTRAINT chk_goods_receipt_attachments_file_size
          CHECK (file_size > 0),
        CONSTRAINT fk_goods_receipt_attachments_receipt
          FOREIGN KEY (goods_receipt_id)
          REFERENCES inventory.goods_receipts(id) ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_goods_receipts_receipt_no
        ON inventory.goods_receipts(organization_id, receipt_no)
        WHERE receipt_no IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_goods_receipts_supplier_doc_no
        ON inventory.goods_receipts(supplier_id, supplier_doc_no)
        WHERE no_supplier_document = false
          AND supplier_doc_no IS NOT NULL
          AND status <> 'cancelled'
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_goods_receipt_items_material_lot
        ON inventory.goods_receipt_items(
          goods_receipt_id,
          material_id,
          COALESCE(lot_no, '')
        )
    `);

    await queryRunner.query(
      `CREATE INDEX idx_goods_receipts_supplier_id ON inventory.goods_receipts(supplier_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_goods_receipts_organization_id ON inventory.goods_receipts(organization_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_goods_receipts_receipt_date ON inventory.goods_receipts(receipt_date)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_goods_receipts_status ON inventory.goods_receipts(status)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_goods_receipt_items_receipt_id ON inventory.goods_receipt_items(goods_receipt_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_goods_receipt_items_material_id ON inventory.goods_receipt_items(material_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_goods_receipt_attachments_receipt_id ON inventory.goods_receipt_attachments(goods_receipt_id)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS inventory.goods_receipt_attachments`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS inventory.goods_receipt_items`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS inventory.goods_receipts`);
    await queryRunner.query(`DROP TABLE IF EXISTS inventory.document_counters`);
    await queryRunner.query(`DROP TABLE IF EXISTS master.reject_reasons`);
    await queryRunner.query(`DROP SCHEMA IF EXISTS inventory`);
  }
}
