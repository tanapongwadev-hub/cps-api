import { MigrationInterface, QueryRunner } from 'typeorm';

// ชื่อเมนูย่อยใต้ "BOM และขั้นตอนการผลิต": ภาพรวม / BOM และขั้นตอนการผลิต — หน้าทำงาน
export class RenameBomMenus1790600000053 implements MigrationInterface {
  name = 'RenameBomMenus1790600000053';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE iam.menus SET name_th = 'ภาพรวม', name_en = 'Overview', updated_at = CURRENT_TIMESTAMP
        WHERE code = 'BOM_DASHBOARD'`,
    );
    await queryRunner.query(
      `UPDATE iam.menus SET name_th = 'BOM และขั้นตอนการผลิต — หน้าทำงาน', name_en = 'BOM and Workflow — Work',
              updated_at = CURRENT_TIMESTAMP WHERE code = 'SETUP_WIZARD'`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE iam.menus SET name_th = 'ภาพรวม BOM และขั้นตอนการผลิต', name_en = 'BOM and Workflow Dashboard',
              updated_at = CURRENT_TIMESTAMP WHERE code = 'BOM_DASHBOARD'`,
    );
    await queryRunner.query(
      `UPDATE iam.menus SET name_th = 'หน้าทำงาน BOM และขั้นตอนการผลิต', name_en = 'BOM and Workflow Work',
              updated_at = CURRENT_TIMESTAMP WHERE code = 'SETUP_WIZARD'`,
    );
  }
}
