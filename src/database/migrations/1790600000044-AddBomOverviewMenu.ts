import { MigrationInterface, QueryRunner } from 'typeorm';

// เมนูย่อย "รายการ BOM / Workflow" (/engineering/bom/overview) ใต้ BOM_WORKFLOW — ดูอย่างเดียว
// permission BOM_OVERVIEW_VIEW (READ) ขอบเขต ALL: ทุก role ที่มี READ เห็นเมนูนี้
export class AddBomOverviewMenu1790600000044 implements MigrationInterface {
  name = 'AddBomOverviewMenu1790600000044';

  async up(queryRunner: QueryRunner): Promise<void> {
    const parent = (await queryRunner.query(
      `SELECT id FROM iam.menus WHERE code = 'BOM_WORKFLOW'`,
    )) as Array<{ id: string }>;
    if (!parent[0]) return;
    // Keep sibling sort_order contiguous from 0: the new menu goes first.
    await queryRunner.query(`UPDATE iam.menus SET sort_order = sort_order + 1 WHERE parent_id = $1`, [parent[0].id]);
    await queryRunner.query(
      `INSERT INTO iam.menus
        (code, name_th, name_en, menu_type, path, icon, sort_order, parent_id,
         is_visible, is_active, created_at, updated_at)
       VALUES
        ('BOM_OVERVIEW', 'รายการ BOM / Workflow', 'BOM & Workflow List', 'SUB',
         '/engineering/bom/overview', 'list-checks', 0, $1, true, true,
         CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT (code) DO NOTHING`,
      [parent[0].id],
    );
    await queryRunner.query(
      `INSERT INTO iam.permissions
         (menu_id, action_id, code, description, access_scope, is_active, created_at, updated_at)
       SELECT menu.id, action.id, 'BOM_OVERVIEW_VIEW',
              'ดูรายการ BOM และ Workflow ทั้งหมด (อ่านอย่างเดียว)', 'ALL', true,
              CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
       FROM iam.menus menu CROSS JOIN iam.actions action
       WHERE menu.code = 'BOM_OVERVIEW' AND action.code = 'READ'
       ON CONFLICT (code) DO NOTHING`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM iam.user_department_permissions WHERE permission_id IN (SELECT id FROM iam.permissions WHERE code = 'BOM_OVERVIEW_VIEW')`,
    );
    await queryRunner.query(
      `DELETE FROM iam.department_permissions WHERE permission_id IN (SELECT id FROM iam.permissions WHERE code = 'BOM_OVERVIEW_VIEW')`,
    );
    await queryRunner.query(`DELETE FROM iam.permissions WHERE code = 'BOM_OVERVIEW_VIEW'`);
    const parent = (await queryRunner.query(
      `SELECT id FROM iam.menus WHERE code = 'BOM_WORKFLOW'`,
    )) as Array<{ id: string }>;
    await queryRunner.query(`DELETE FROM iam.menus WHERE code = 'BOM_OVERVIEW'`);
    if (parent[0]) {
      await queryRunner.query(`UPDATE iam.menus SET sort_order = sort_order - 1 WHERE parent_id = $1`, [parent[0].id]);
    }
  }
}
