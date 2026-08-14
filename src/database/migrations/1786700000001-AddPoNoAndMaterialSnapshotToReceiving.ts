import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Materials Receiving — เพิ่ม PO header, material snapshot, แนบไฟล์, และลบ idempotency_key
 *
 * 1. เพิ่ม `po_no` (varchar 30, nullable) — เลขที่ PO ใช้เป็น header ของเอกสาร
 * 2. เพิ่ม `material_type` (varchar 20, nullable) — snapshot material shape (PCS/PIPE/SHEET/COIL)
 * 3. เพิ่ม `ratio` (integer, nullable) — snapshot จำนวนชิ้นต่อเส้น/แผ่น/ม้วน
 * 4. เพิ่ม `pieces_quantity` (numeric 18,4, nullable) — จำนวนชิ้นที่ใช้ได้จริง
 *    (สำหรับ PIPE/SHEET/COIL = receive_quantity × ratio, สำหรับ PCS = null)
 * 5. เพิ่ม `attachment_url` (varchar 500, nullable) — path ของไฟล์แนบ (รูป/เอกสาร)
 * 6. เพิ่ม `attachment_name` (varchar 255, nullable) — ชื่อไฟล์เดิม
 * 7. ลบ `idempotency_key` และ unique index ที่เกี่ยวข้อง
 */
export class AddPoNoAndMaterialSnapshotToReceiving1786700000001
  implements MigrationInterface
{
  name = 'AddPoNoAndMaterialSnapshotToReceiving1786700000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop unique index on idempotency_key before dropping the column
    await queryRunner.query(`
      DROP INDEX IF EXISTS "inventory"."uq_material_receivings_idempotency_key"
    `);

    await queryRunner.query(`
      ALTER TABLE "inventory"."material_receivings"
      DROP COLUMN "idempotency_key"
    `);

    await queryRunner.query(`
      ALTER TABLE "inventory"."material_receivings"
      ADD COLUMN "po_no" varchar(30) DEFAULT NULL
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_material_receivings_po_no"
      ON "inventory"."material_receivings" ("po_no")
    `);

    await queryRunner.query(`
      ALTER TABLE "inventory"."material_receivings"
      ADD COLUMN "material_type" varchar(20) DEFAULT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "inventory"."material_receivings"
      ADD COLUMN "ratio" integer DEFAULT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "inventory"."material_receivings"
      ADD CONSTRAINT "chk_material_receivings_ratio_positive"
      CHECK ("ratio" IS NULL OR "ratio" >= 1)
    `);

    await queryRunner.query(`
      ALTER TABLE "inventory"."material_receivings"
      ADD COLUMN "pieces_quantity" numeric(18,4) DEFAULT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "inventory"."material_receivings"
      ADD CONSTRAINT "chk_material_receivings_pieces_qty_non_negative"
      CHECK ("pieces_quantity" IS NULL OR "pieces_quantity" >= 0)
    `);

    await queryRunner.query(`
      ALTER TABLE "inventory"."material_receivings"
      ADD COLUMN "attachment_url" varchar(500) DEFAULT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "inventory"."material_receivings"
      ADD COLUMN "attachment_name" varchar(255) DEFAULT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "inventory"."material_receivings"
      DROP COLUMN "attachment_name"
    `);
    await queryRunner.query(`
      ALTER TABLE "inventory"."material_receivings"
      DROP COLUMN "attachment_url"
    `);
    await queryRunner.query(`
      ALTER TABLE "inventory"."material_receivings"
      DROP CONSTRAINT "chk_material_receivings_pieces_qty_non_negative"
    `);
    await queryRunner.query(`
      ALTER TABLE "inventory"."material_receivings"
      DROP COLUMN "pieces_quantity"
    `);
    await queryRunner.query(`
      ALTER TABLE "inventory"."material_receivings"
      DROP CONSTRAINT "chk_material_receivings_ratio_positive"
    `);
    await queryRunner.query(`
      ALTER TABLE "inventory"."material_receivings"
      DROP COLUMN "ratio"
    `);
    await queryRunner.query(`
      ALTER TABLE "inventory"."material_receivings"
      DROP COLUMN "material_type"
    `);
    await queryRunner.query(`
      DROP INDEX "inventory"."idx_material_receivings_po_no"
    `);
    await queryRunner.query(`
      ALTER TABLE "inventory"."material_receivings"
      DROP COLUMN "po_no"
    `);
    await queryRunner.query(`
      ALTER TABLE "inventory"."material_receivings"
      ADD COLUMN "idempotency_key" varchar(80) DEFAULT NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_material_receivings_idempotency_key"
      ON "inventory"."material_receivings" ("idempotency_key")
      WHERE "idempotency_key" IS NOT NULL
    `);
  }
}
