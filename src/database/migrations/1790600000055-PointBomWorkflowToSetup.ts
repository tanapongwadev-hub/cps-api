import { MigrationInterface, QueryRunner } from 'typeorm';

// หน้าแดชบอร์ด /engineering/bom ถูกลบ: หมวด BOM_WORKFLOW ชี้ไปหน้าทำงานแทน
export class PointBomWorkflowToSetup1790600000055 implements MigrationInterface {
  name = 'PointBomWorkflowToSetup1790600000055';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE iam.menus SET path = '/engineering/setup', updated_at = CURRENT_TIMESTAMP WHERE code = 'BOM_WORKFLOW'`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE iam.menus SET path = '/engineering/bom', updated_at = CURRENT_TIMESTAMP WHERE code = 'BOM_WORKFLOW'`,
    );
  }
}
