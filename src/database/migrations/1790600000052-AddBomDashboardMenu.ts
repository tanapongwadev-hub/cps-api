import { MigrationInterface, QueryRunner } from 'typeorm';

// แยกหน้าแดชบอร์ด (/engineering/bom) ออกจากหน้าทำงาน (/engineering/setup)
// - เมนูย่อยใหม่ BOM_DASHBOARD "ภาพรวม BOM และขั้นตอนการผลิต" เป็นรายการแรกใต้ BOM_WORKFLOW
//   permission BOM_DASHBOARD_VIEW (READ) ขอบเขต ALL: ทุก role ที่มี READ เห็นเมนูนี้
// - SETUP_WIZARD เปลี่ยนชื่อเป็นหน้าทำงาน; BOM_WORKFLOW (หมวดหลัก) ชี้ไปแดชบอร์ด
export class AddBomDashboardMenu1790600000052 implements MigrationInterface {
  name = 'AddBomDashboardMenu1790600000052';

  async up(queryRunner: QueryRunner): Promise<void> {
    const parent = (await queryRunner.query(
      `SELECT id FROM iam.menus WHERE code = 'BOM_WORKFLOW'`,
    )) as Array<{ id: string }>;
    if (!parent[0]) return;
    const exists = (await queryRunner.query(
      `SELECT 1 FROM iam.menus WHERE code = 'BOM_DASHBOARD'`,
    )) as unknown[];
    if (exists.length === 0) {
      // keep sibling sort_order contiguous from 0: the dashboard goes first
      await queryRunner.query(
        `UPDATE iam.menus SET sort_order = sort_order + 1 WHERE parent_id = $1`,
        [parent[0].id],
      );
      await queryRunner.query(
        `INSERT INTO iam.menus
          (code, name_th, name_en, menu_type, path, icon, sort_order, parent_id,
           is_visible, is_active, created_at, updated_at)
         VALUES
          ('BOM_DASHBOARD', 'ภาพรวม BOM และขั้นตอนการผลิต', 'BOM and Workflow Dashboard', 'SUB',
           '/engineering/bom', 'layout-dashboard', 0, $1, true, true,
           CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [parent[0].id],
      );
    }
    await queryRunner.query(
      `INSERT INTO iam.permissions
         (menu_id, action_id, code, description, access_scope, is_active, created_at, updated_at)
       SELECT menu.id, action.id, 'BOM_DASHBOARD_VIEW',
              'ดูภาพรวม BOM และขั้นตอนการผลิต (อ่านอย่างเดียว)', 'ALL', true,
              CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
       FROM iam.menus menu CROSS JOIN iam.actions action
       WHERE menu.code = 'BOM_DASHBOARD' AND action.code = 'READ'
       ON CONFLICT (code) DO NOTHING`,
    );
    await queryRunner.query(
      `UPDATE iam.menus SET name_th = 'หน้าทำงาน BOM และขั้นตอนการผลิต', name_en = 'BOM and Workflow Work',
              updated_at = CURRENT_TIMESTAMP WHERE code = 'SETUP_WIZARD'`,
    );
    await queryRunner.query(
      `UPDATE iam.menus SET path = '/engineering/bom', updated_at = CURRENT_TIMESTAMP WHERE code = 'BOM_WORKFLOW'`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM iam.user_department_permissions WHERE permission_id IN (SELECT id FROM iam.permissions WHERE code = 'BOM_DASHBOARD_VIEW')`,
    );
    await queryRunner.query(
      `DELETE FROM iam.department_permissions WHERE permission_id IN (SELECT id FROM iam.permissions WHERE code = 'BOM_DASHBOARD_VIEW')`,
    );
    await queryRunner.query(`DELETE FROM iam.permissions WHERE code = 'BOM_DASHBOARD_VIEW'`);
    const parent = (await queryRunner.query(
      `SELECT id FROM iam.menus WHERE code = 'BOM_WORKFLOW'`,
    )) as Array<{ id: string }>;
    await queryRunner.query(`DELETE FROM iam.menus WHERE code = 'BOM_DASHBOARD'`);
    if (parent[0]) {
      await queryRunner.query(
        `UPDATE iam.menus SET sort_order = sort_order - 1 WHERE parent_id = $1`,
        [parent[0].id],
      );
    }
    await queryRunner.query(
      `UPDATE iam.menus SET name_th = 'BOM และขั้นตอนการผลิต', name_en = 'BOM and Workflow',
              updated_at = CURRENT_TIMESTAMP WHERE code = 'SETUP_WIZARD'`,
    );
    await queryRunner.query(
      `UPDATE iam.menus SET path = '/engineering/setup', updated_at = CURRENT_TIMESTAMP WHERE code = 'BOM_WORKFLOW'`,
    );
  }
}
