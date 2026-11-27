import { MigrationInterface, QueryRunner } from 'typeorm';

// เมนู "การขายตามขั้นตอน" (/sales/process) เป็นเมนูแรกใต้ "การขายและจัดส่ง"
// หน้าจอรูปแบบเดียวกับการสั่งผลิตตามกระบวนการ: แท็บรอยืนยันขาย / ยืนยันขายแล้ว
// และหน้ารายละเอียดแบบไทม์ไลน์ขั้นตอน ใช้ API การขายเดิมทั้งหมด
// permission นำทาง SALES_PROCESS_VIEW (READ) คุมเฉพาะการแสดงเมนู ขอบเขตแผนกเริ่มต้น
// คัดลอกจาก SALES_ORDER_VIEW และ SALES_JOB_ORDER_VIEW ส่วนข้อมูลยังใช้สิทธิ์การขายเดิม
export class AddSalesProcessMenu1790600000064 implements MigrationInterface {
  name = 'AddSalesProcessMenu1790600000064';

  async up(queryRunner: QueryRunner): Promise<void> {
    const parent = (await queryRunner.query(
      `SELECT id FROM iam.menus WHERE code = 'SALES'`,
    )) as Array<{ id: string }>;
    if (!parent[0]) return;

    // First child; shift siblings to keep sort orders contiguous.
    await queryRunner.query(
      `UPDATE iam.menus SET sort_order = sort_order + 1 WHERE parent_id = $1`,
      [parent[0].id],
    );
    await queryRunner.query(
      `INSERT INTO iam.menus
        (code, name_th, name_en, menu_type, path, icon, sort_order, parent_id,
         is_visible, is_active, created_at, updated_at)
       VALUES
        ('SALES_PROCESS', 'การขายตามขั้นตอน', 'Sales Process', 'SUB',
         '/sales/process', 'workflow', 0, $1, true, true,
         CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT (code) DO NOTHING`,
      [parent[0].id],
    );

    const sources = (await queryRunner.query(
      `SELECT id, access_scope FROM iam.permissions
       WHERE code IN ('SALES_ORDER_VIEW', 'SALES_JOB_ORDER_VIEW')`,
    )) as Array<{ id: string; access_scope: string }>;
    const restricted =
      sources.length > 0 &&
      sources.every((source) => source.access_scope === 'DEPARTMENTS');

    const inserted = (await queryRunner.query(
      `INSERT INTO iam.permissions
         (menu_id, action_id, code, description, access_scope, is_active, created_at, updated_at)
       SELECT menu.id, action.id, 'SALES_PROCESS_VIEW',
              'แสดงเมนูการขายตามขั้นตอน (ข้อมูลใช้สิทธิ์ SALES_ORDER_VIEW / SALES_JOB_ORDER_VIEW)',
              $1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
       FROM iam.menus menu CROSS JOIN iam.actions action
       WHERE menu.code = 'SALES_PROCESS' AND action.code = 'READ'
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
       WHERE permission_id IN (SELECT id FROM iam.permissions WHERE code = 'SALES_PROCESS_VIEW')`,
    );
    await queryRunner.query(
      `DELETE FROM iam.department_permissions
       WHERE permission_id IN (SELECT id FROM iam.permissions WHERE code = 'SALES_PROCESS_VIEW')`,
    );
    await queryRunner.query(`DELETE FROM iam.permissions WHERE code = 'SALES_PROCESS_VIEW'`);
    const rows = (await queryRunner.query(
      `SELECT parent_id FROM iam.menus WHERE code = 'SALES_PROCESS'`,
    )) as Array<{ parent_id: string }>;
    await queryRunner.query(`DELETE FROM iam.menus WHERE code = 'SALES_PROCESS'`);
    if (rows[0]) {
      await queryRunner.query(
        `UPDATE iam.menus SET sort_order = sort_order - 1 WHERE parent_id = $1 AND sort_order > 0`,
        [rows[0].parent_id],
      );
    }
  }
}
