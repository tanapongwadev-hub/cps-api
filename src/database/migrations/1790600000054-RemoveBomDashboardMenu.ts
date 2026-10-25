import { MigrationInterface, QueryRunner } from 'typeorm';

// ลบเมนูย่อย "ภาพรวม" (BOM_DASHBOARD) ออกจากหมวด BOM และขั้นตอนการผลิต
// หน้า /engineering/bom ยังอยู่ (เข้าจากแท็บบนหัวหน้าทำงาน ด้วยสิทธิ์ SETUP_WIZARD_VIEW)
export class RemoveBomDashboardMenu1790600000054 implements MigrationInterface {
  name = 'RemoveBomDashboardMenu1790600000054';

  async up(queryRunner: QueryRunner): Promise<void> {
    const menu = (await queryRunner.query(
      `SELECT id, parent_id, sort_order FROM iam.menus WHERE code = 'BOM_DASHBOARD'`,
    )) as Array<{ id: string; parent_id: string | null; sort_order: number }>;
    if (!menu[0]) return;
    await queryRunner.query(
      `DELETE FROM iam.user_department_permissions WHERE permission_id IN (SELECT id FROM iam.permissions WHERE menu_id = $1)`,
      [menu[0].id],
    );
    await queryRunner.query(
      `DELETE FROM iam.department_permissions WHERE permission_id IN (SELECT id FROM iam.permissions WHERE menu_id = $1)`,
      [menu[0].id],
    );
    await queryRunner.query(`DELETE FROM iam.permissions WHERE menu_id = $1`, [menu[0].id]);
    await queryRunner.query(`DELETE FROM iam.menus WHERE id = $1`, [menu[0].id]);
    // keep sibling sort_order contiguous from 0
    await queryRunner.query(
      `UPDATE iam.menus SET sort_order = sort_order - 1 WHERE parent_id = $1 AND sort_order > $2`,
      [menu[0].parent_id, menu[0].sort_order],
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const parent = (await queryRunner.query(
      `SELECT id FROM iam.menus WHERE code = 'BOM_WORKFLOW'`,
    )) as Array<{ id: string }>;
    if (!parent[0]) return;
    await queryRunner.query(
      `UPDATE iam.menus SET sort_order = sort_order + 1 WHERE parent_id = $1`,
      [parent[0].id],
    );
    await queryRunner.query(
      `INSERT INTO iam.menus
        (code, name_th, name_en, menu_type, path, icon, sort_order, parent_id,
         is_visible, is_active, created_at, updated_at)
       VALUES ('BOM_DASHBOARD', 'ภาพรวม', 'Overview', 'SUB', '/engineering/bom', 'layout-dashboard',
               0, $1, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [parent[0].id],
    );
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
  }
}
