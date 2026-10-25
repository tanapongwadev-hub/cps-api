import { MigrationInterface, QueryRunner } from 'typeorm';

// เมนูหลัก BOM_WORKFLOW เปิดหน้าแดชบอร์ด /engineering/bom; เมนูย่อย SETUP_WIZARD คือหน้าทำงาน
export class PointBomWorkflowToDashboard1790600000056 implements MigrationInterface {
  name = 'PointBomWorkflowToDashboard1790600000056';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE iam.menus SET path = '/engineering/bom', updated_at = CURRENT_TIMESTAMP WHERE code = 'BOM_WORKFLOW'`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE iam.menus SET path = '/engineering/setup', updated_at = CURRENT_TIMESTAMP WHERE code = 'BOM_WORKFLOW'`,
    );
  }
}
