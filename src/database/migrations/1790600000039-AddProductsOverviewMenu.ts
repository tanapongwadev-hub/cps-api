import { MigrationInterface, QueryRunner } from 'typeorm';

// เมนู "ภาพรวมสินค้า" (/engineering/products/overview) เป็นรายการแรกใต้ "สินค้าและวิศวกรรม"
// permission นำทาง PRODUCTS_OVERVIEW_VIEW (READ) คัดลอกขอบเขตแผนกจาก PRODUCTS_VIEW
// ส่วนข้อมูลในหน้าจอยังถูกตรวจด้วย PRODUCTS_VIEW ตามเดิม
export class AddProductsOverviewMenu1790600000039
  implements MigrationInterface
{
  name = 'AddProductsOverviewMenu1790600000039';

  async up(queryRunner: QueryRunner): Promise<void> {
    const parent = (await queryRunner.query(
      `SELECT id FROM iam.menus WHERE code = 'PRODUCT_ENGINEERING'`,
    )) as Array<{ id: string }>;
    if (!parent[0]) return;

    // Keep sibling sort_order contiguous from 0: put the new menu first.
    await queryRunner.query(
      `UPDATE iam.menus SET sort_order = sort_order + 1 WHERE parent_id = $1`,
      [parent[0].id],
    );
    await queryRunner.query(
      `INSERT INTO iam.menus
        (code, name_th, name_en, menu_type, path, icon, sort_order, parent_id,
         is_visible, is_active, created_at, updated_at)
       VALUES
        ('PRODUCTS_OVERVIEW', 'ภาพรวมสินค้า', 'Products Overview', 'SUB',
         '/engineering/products/overview', 'gauge', 0, $1, true, true,
         CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT (code) DO NOTHING`,
      [parent[0].id],
    );

    const sources = (await queryRunner.query(
      `SELECT id, access_scope FROM iam.permissions WHERE code = 'PRODUCTS_VIEW'`,
    )) as Array<{ id: string; access_scope: string }>;
    const restricted =
      sources.length > 0 &&
      sources.every((source) => source.access_scope === 'DEPARTMENTS');

    const inserted = (await queryRunner.query(
      `INSERT INTO iam.permissions
         (menu_id, action_id, code, description, access_scope, is_active, created_at, updated_at)
       SELECT menu.id, action.id, 'PRODUCTS_OVERVIEW_VIEW',
              'แสดงเมนูภาพรวมสินค้า (ดูข้อมูลต้องมี PRODUCTS_VIEW)', $1, true,
              CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
       FROM iam.menus menu CROSS JOIN iam.actions action
       WHERE menu.code = 'PRODUCTS_OVERVIEW' AND action.code = 'READ'
       ON CONFLICT (code) DO NOTHING
       RETURNING id`,
      [restricted ? 'DEPARTMENTS' : 'ALL'],
    )) as Array<{ id: string }>;
    const permissionId = inserted[0]?.id;
    if (!permissionId || !restricted) return;

    await queryRunner.query(
      `INSERT INTO iam.department_permissions
         (permission_id, department_id, is_active, created_at, updated_at)
       SELECT DISTINCT $1::bigint, dp.department_id, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
       FROM iam.department_permissions dp
       WHERE dp.permission_id = ANY($2::bigint[]) AND dp.is_active
       ON CONFLICT (permission_id, department_id) DO NOTHING`,
      [permissionId, sources.map((source) => source.id)],
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM iam.user_department_permissions
       WHERE permission_id IN (SELECT id FROM iam.permissions WHERE code = 'PRODUCTS_OVERVIEW_VIEW')`,
    );
    await queryRunner.query(
      `DELETE FROM iam.department_permissions
       WHERE permission_id IN (SELECT id FROM iam.permissions WHERE code = 'PRODUCTS_OVERVIEW_VIEW')`,
    );
    await queryRunner.query(
      `DELETE FROM iam.permissions WHERE code = 'PRODUCTS_OVERVIEW_VIEW'`,
    );
    const parent = (await queryRunner.query(
      `SELECT id FROM iam.menus WHERE code = 'PRODUCT_ENGINEERING'`,
    )) as Array<{ id: string }>;
    await queryRunner.query(`DELETE FROM iam.menus WHERE code = 'PRODUCTS_OVERVIEW'`);
    if (parent[0]) {
      await queryRunner.query(
        `UPDATE iam.menus SET sort_order = sort_order - 1 WHERE parent_id = $1`,
        [parent[0].id],
      );
    }
  }
}
