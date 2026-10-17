import { MigrationInterface, QueryRunner } from 'typeorm';

// เมนูรวมเมนู (/menu-hub) — MAIN menu ต่อจากภาพรวม แสดงเมนูทั้งหมดที่ผู้ใช้เข้าได้เป็นการ์ด
// สิทธิ์ MENU_HUB_VIEW ใช้ action READ และ access_scope ALL จึงเห็นได้ทุก role ที่มี READ
export class AddMenuHubMenu1790600000036 implements MigrationInterface {
  name = 'AddMenuHubMenu1790600000036';

  async up(queryRunner: QueryRunner): Promise<void> {
    const dashboard = (await queryRunner.query(
      `SELECT sort_order FROM iam.menus WHERE code = 'DASHBOARD' AND parent_id IS NULL`,
    )) as unknown as Array<{ sort_order: number | string }>;
    const position = Number(dashboard[0]?.sort_order ?? 0) + 1;

    // เว้นตำแหน่งต่อจากภาพรวม โดยยังคง sort_order ของ root ให้ต่อเนื่อง
    await queryRunner.query(
      `UPDATE iam.menus SET sort_order = sort_order + 1
       WHERE parent_id IS NULL AND sort_order >= $1
         AND code <> 'MENU_HUB'`,
      [position],
    );
    await queryRunner.query(
      `INSERT INTO iam.menus
        (code, name_th, name_en, menu_type, path, icon, sort_order, parent_id,
         is_visible, is_active, created_at, updated_at)
       VALUES
        ('MENU_HUB', 'รวมเมนู', 'All Menus', 'MAIN', '/menu-hub',
         'layout-grid', $1, NULL, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT (code) DO NOTHING`,
      [position],
    );
    await queryRunner.query(
      `INSERT INTO iam.permissions
         (menu_id, action_id, code, description, is_active, created_at, updated_at)
       SELECT menu.id, action.id, 'MENU_HUB_VIEW', 'ดูหน้ารวมเมนู',
              true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
       FROM iam.menus menu
       CROSS JOIN iam.actions action
       WHERE menu.code = 'MENU_HUB' AND action.code = 'READ'
       ON CONFLICT (code) DO NOTHING`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM iam.user_department_permissions
       WHERE permission_id IN (SELECT id FROM iam.permissions WHERE code = 'MENU_HUB_VIEW')`,
    );
    await queryRunner.query(
      `DELETE FROM iam.department_permissions
       WHERE permission_id IN (SELECT id FROM iam.permissions WHERE code = 'MENU_HUB_VIEW')`,
    );
    await queryRunner.query(`DELETE FROM iam.permissions WHERE code = 'MENU_HUB_VIEW'`);
    await queryRunner.query(`DELETE FROM iam.menus WHERE code = 'MENU_HUB'`);
  }
}
