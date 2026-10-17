import { MigrationInterface, QueryRunner } from 'typeorm';

// เมนูรายงานสอบกลับสินค้า (/reports/product-lots) ใต้ "รายงานและตรวจสอบ"
// รายการ Lot สินค้า (FG) พร้อมวันผลิต จำนวนแพ็ก/ขาย และวันขาย
// permission นำทาง PRODUCT_LOT_REPORT_VIEW (READ) คุมเฉพาะการแสดงเมนู ขอบเขตแผนกเริ่มต้น
// คัดลอกจาก PRODUCTION_ORDER_VIEW (สิทธิ์ที่หน้าจอใช้จริง) ส่วนข้อมูลการขายในรายงาน
// ยังต้องมีสิทธิ์การขายตามเดิม
export class AddProductLotReportMenu1790600000038
  implements MigrationInterface
{
  name = 'AddProductLotReportMenu1790600000038';

  async up(queryRunner: QueryRunner): Promise<void> {
    const parent = (await queryRunner.query(
      `SELECT id FROM iam.menus WHERE code = 'REPORTS_AUDIT'`,
    )) as Array<{ id: string }>;
    if (!parent[0]) return;
    const sort = (await queryRunner.query(
      `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM iam.menus WHERE parent_id = $1`,
      [parent[0].id],
    )) as Array<{ next: number | string }>;

    await queryRunner.query(
      `INSERT INTO iam.menus
        (code, name_th, name_en, menu_type, path, icon, sort_order, parent_id,
         is_visible, is_active, created_at, updated_at)
       VALUES
        ('PRODUCT_LOT_REPORT', 'รายงานสอบกลับสินค้า', 'Product Lot Report', 'SUB',
         '/reports/product-lots', 'package', $1, $2, true, true,
         CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT (code) DO NOTHING`,
      [Number(sort[0].next), parent[0].id],
    );

    const sources = (await queryRunner.query(
      `SELECT id, access_scope FROM iam.permissions WHERE code = 'PRODUCTION_ORDER_VIEW'`,
    )) as Array<{ id: string; access_scope: string }>;
    const restricted =
      sources.length > 0 &&
      sources.every((source) => source.access_scope === 'DEPARTMENTS');

    const inserted = (await queryRunner.query(
      `INSERT INTO iam.permissions
         (menu_id, action_id, code, description, access_scope, is_active, created_at, updated_at)
       SELECT menu.id, action.id, 'PRODUCT_LOT_REPORT_VIEW',
              'แสดงเมนูรายงานสอบกลับสินค้า (ดูข้อมูลต้องมี PRODUCTION_ORDER_VIEW)', $1, true,
              CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
       FROM iam.menus menu CROSS JOIN iam.actions action
       WHERE menu.code = 'PRODUCT_LOT_REPORT' AND action.code = 'READ'
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
       WHERE permission_id IN (SELECT id FROM iam.permissions WHERE code = 'PRODUCT_LOT_REPORT_VIEW')`,
    );
    await queryRunner.query(
      `DELETE FROM iam.department_permissions
       WHERE permission_id IN (SELECT id FROM iam.permissions WHERE code = 'PRODUCT_LOT_REPORT_VIEW')`,
    );
    await queryRunner.query(
      `DELETE FROM iam.permissions WHERE code = 'PRODUCT_LOT_REPORT_VIEW'`,
    );
    await queryRunner.query(`DELETE FROM iam.menus WHERE code = 'PRODUCT_LOT_REPORT'`);
  }
}
