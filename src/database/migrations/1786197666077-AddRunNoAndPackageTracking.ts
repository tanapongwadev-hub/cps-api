import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Materials Receiving — เพิ่ม RunNo และ Package QR Tracking
 *
 * เพิ่ม:
 *  - run_no ใน material_receivings      (เลขรันสำหรับแต่ละใบ แยกจาก internalLotNo)
 *  - qr_code ใน material_receiving_packages  (QR สำหรับแต่ละกล่อง)
 *  - status ใน material_receiving_packages  (tracking status ของแต่ละกล่อง)
 *
 * Package Status:
 *  - pending    = รอดำเนินการ (default)
 *  - in_stock   = อยู่ในสต็อก
 *  - issued     = เบิกออกแล้ว
 *  - damaged    = เสียหาย
 *  - returned   = คืน supplier
 */
export class AddRunNoAndPackageTracking1786197666077 implements MigrationInterface {
  name = 'AddRunNoAndPackageTracking1786197666077';

  async up(queryRunner: QueryRunner): Promise<void> {
    // -----------------------------------------------------------------
    // 1) เพิ่ม run_no ใน material_receivings
    //    รูปแบบ: MR-YYYYMMDD-XXXX (running number รายวัน)
    // -----------------------------------------------------------------
    await queryRunner.query(`
      ALTER TABLE inventory.material_receivings
        ADD COLUMN run_no VARCHAR(20)
    `);

    // Create index for run_no
    await queryRunner.query(`
      CREATE INDEX idx_material_receivings_run_no
        ON inventory.material_receivings(run_no)
    `);

    // -----------------------------------------------------------------
    // 2) เพิ่ม qr_code และ status ใน material_receiving_packages
    // -----------------------------------------------------------------
    await queryRunner.query(`
      ALTER TABLE inventory.material_receiving_packages
        ADD COLUMN qr_code TEXT
    `);

    await queryRunner.query(`
      ALTER TABLE inventory.material_receiving_packages
        ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'pending'
    `);

    // Add CHECK constraint for valid package status
    await queryRunner.query(`
      ALTER TABLE inventory.material_receiving_packages
        ADD CONSTRAINT chk_material_receiving_packages_status
        CHECK (status IN ('pending', 'in_stock', 'issued', 'damaged', 'returned'))
    `);

    // Create index for package status
    await queryRunner.query(`
      CREATE INDEX idx_material_receiving_packages_status
        ON inventory.material_receiving_packages(status)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS inventory.idx_material_receiving_packages_status
    `);
    await queryRunner.query(`
      ALTER TABLE inventory.material_receiving_packages
        DROP CONSTRAINT IF EXISTS chk_material_receiving_packages_status
    `);
    await queryRunner.query(`
      ALTER TABLE inventory.material_receiving_packages
        DROP COLUMN IF EXISTS status
    `);
    await queryRunner.query(`
      ALTER TABLE inventory.material_receiving_packages
        DROP COLUMN IF EXISTS qr_code
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS inventory.idx_material_receivings_run_no
    `);
    await queryRunner.query(`
      ALTER TABLE inventory.material_receivings
        DROP COLUMN IF EXISTS run_no
    `);
  }
}
