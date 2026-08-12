import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * เพิ่ม lot_detail_no สำหรับแต่ละ package (LOT-CCI-DETAIL)
 * Format: CCI-YYYY[M]DD-XXXXX-PK
 *
 * ทำให้ QR code แต่ละกล่องอ้างอิงถึง LOT detail ที่ถูกต้อง
 */
export class AddLotDetailNo1786197666078 implements MigrationInterface {
  name = 'AddLotDetailNo1786197666078';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE inventory.material_receiving_packages
        ADD COLUMN lot_detail_no VARCHAR(40)
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX idx_material_receiving_packages_lot_detail_no
        ON inventory.material_receiving_packages(lot_detail_no)
        WHERE lot_detail_no IS NOT NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS inventory.idx_material_receiving_packages_lot_detail_no
    `);
    await queryRunner.query(`
      ALTER TABLE inventory.material_receiving_packages
        DROP COLUMN IF EXISTS lot_detail_no
    `);
  }
}
