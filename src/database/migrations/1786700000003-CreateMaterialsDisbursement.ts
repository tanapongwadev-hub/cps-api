import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Materials Disbursement — จ่ายออกวัสดุ
 *
 * เพิ่มตาราง 3 ตารางใน schema `inventory`:
 *  - materials_disbursements              หัวเอกสารจ่ายออก
 *  - material_disbursement_items        รายการวัสดุที่ขอเบิก
 *  - material_disbursement_packages      รายละเอียด package ที่ถูกหักออก (FIFO)
 *
 * หมายเหตุ
 *  - ตาราง materials_disbursements เก็บข้อมูลหลาย material ต่อ 1 ใบจ่ายออก
 *  - สถานะ: draft → confirmed (ตัดสต็อก FIFO) / cancelled (ยกเลิก, คืนสต็อกถ้าเคย confirmed)
 *  - ประเภท: stock_cut (ตัดสต็อก) / production (เบิกเพื่อผลิต)
 *  - ตาราง packages เก็บว่า package ไหนถูกหักออกจำนวนเท่าไหร่
 */
export class CreateMaterialsDisbursement1786700000003 implements MigrationInterface {
  name = 'CreateMaterialsDisbursement1786700000003';

  async up(queryRunner: QueryRunner): Promise<void> {
    // -----------------------------------------------------------------
    // 1) materials_disbursements — หัวเอกสาร
    // -----------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE inventory.materials_disbursements (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        disbursement_no VARCHAR(30) NOT NULL,
        disbursement_type VARCHAR(20) NOT NULL,
        disbursement_date DATE NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'draft',
        reason VARCHAR(500),
        attachment_url TEXT,
        attachment_name VARCHAR(255),
        remark TEXT,
        confirmed_by BIGINT,
        confirmed_at TIMESTAMP,
        cancelled_by BIGINT,
        cancelled_at TIMESTAMP,
        cancel_reason VARCHAR(500),
        created_by BIGINT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uq_materials_disbursements_no UNIQUE (disbursement_no),
        CONSTRAINT chk_materials_disbursements_status
          CHECK (status IN ('draft', 'confirmed', 'cancelled')),
        CONSTRAINT chk_materials_disbursements_type
          CHECK (disbursement_type IN ('stock_cut', 'production'))
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_materials_disbursements_no
        ON inventory.materials_disbursements(disbursement_no)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_materials_disbursements_type
        ON inventory.materials_disbursements(disbursement_type)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_materials_disbursements_date
        ON inventory.materials_disbursements(disbursement_date)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_materials_disbursements_status
        ON inventory.materials_disbursements(status)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_materials_disbursements_created_at
        ON inventory.materials_disbursements(created_at)
    `);

    // -----------------------------------------------------------------
    // 2) material_disbursement_items — รายการวัสดุ
    // -----------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE inventory.material_disbursement_items (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        disbursement_id BIGINT NOT NULL,
        material_id BIGINT NOT NULL,
        requested_quantity NUMERIC(18,4) NOT NULL,
        disbursed_quantity NUMERIC(18,4) NOT NULL DEFAULT 0,
        created_by BIGINT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_disbursement_items_disbursement
          FOREIGN KEY (disbursement_id)
          REFERENCES inventory.materials_disbursements(id)
          ON DELETE CASCADE,
        CONSTRAINT fk_disbursement_items_material
          FOREIGN KEY (material_id)
          REFERENCES master.materials(id)
          ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_disbursement_items_disbursement
        ON inventory.material_disbursement_items(disbursement_id)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_disbursement_items_material
        ON inventory.material_disbursement_items(material_id)
    `);

    // -----------------------------------------------------------------
    // 3) material_disbursement_packages — package ที่ถูกหัก (FIFO)
    // -----------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE inventory.material_disbursement_packages (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        disbursement_item_id BIGINT NOT NULL,
        package_id BIGINT NOT NULL,
        disbursed_quantity NUMERIC(18,4) NOT NULL,
        created_by BIGINT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_disbursement_packages_item
          FOREIGN KEY (disbursement_item_id)
          REFERENCES inventory.material_disbursement_items(id)
          ON DELETE CASCADE,
        CONSTRAINT fk_disbursement_packages_package
          FOREIGN KEY (package_id)
          REFERENCES inventory.material_receiving_packages(id)
          ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_disbursement_packages_item
        ON inventory.material_disbursement_packages(disbursement_item_id)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_disbursement_packages_package
        ON inventory.material_disbursement_packages(package_id)
    `);

    // -----------------------------------------------------------------
    // 4) Disbursement counter — running number รายวัน
    // -----------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE inventory.materials_disbursement_counters (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        disbursement_date DATE NOT NULL,
        last_number INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uq_materials_disbursement_counters_date
          UNIQUE (disbursement_date)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_materials_disbursement_counters_date
        ON inventory.materials_disbursement_counters(disbursement_date)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS inventory.material_disbursement_packages`);
    await queryRunner.query(`DROP TABLE IF EXISTS inventory.material_disbursement_items`);
    await queryRunner.query(`DROP TABLE IF EXISTS inventory.materials_disbursements`);
    await queryRunner.query(`DROP TABLE IF EXISTS inventory.materials_disbursement_counters`);
  }
}
