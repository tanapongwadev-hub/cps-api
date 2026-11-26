import { MigrationInterface, QueryRunner } from 'typeorm';

// เมนูสแกน QR ติดตามสถานะ (/scan) — MAIN menu ต่อจาก "รวมเมนู"
// สิทธิ์ SCAN_TRACE_VIEW ใช้ action READ และไม่จำกัดแผนก (access_scope ALL)
// จึงเห็นได้ทุก role ที่มี READ ข้อมูลที่หน้าแสดงยังตามสิทธิ์รายงานเดิมของแต่ละคน
export class AddScanTraceMenu1790600000063 implements MigrationInterface {
  name = 'AddScanTraceMenu1790600000063';

  async up(queryRunner: QueryRunner): Promise<void> {
    const rows = (await queryRunner.query(
      `SELECT sort_order FROM iam.menus WHERE code = 'MENU_HUB' AND parent_id IS NULL`,
    )) as unknown as Array<{ sort_order: number | string }>;
    // Right after รวมเมนู; keep root sort orders contiguous for the reorder editor.
    const position = rows.length ? Number(rows[0].sort_order) + 1 : 0;
    await queryRunner.query(
      `UPDATE iam.menus SET sort_order = sort_order + 1
       WHERE parent_id IS NULL AND sort_order >= $1`,
      [position],
    );
    await queryRunner.query(
      `INSERT INTO iam.menus
        (code, name_th, name_en, menu_type, path, icon, sort_order, parent_id,
         is_visible, is_active, created_at, updated_at)
       VALUES
        ('SCAN_TRACE', 'สแกน QR ติดตามสถานะ', 'Scan QR Status', 'MAIN', '/scan',
         'scan-line', $1, NULL, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT (code) DO NOTHING`,
      [position],
    );
    await queryRunner.query(
      `INSERT INTO iam.permissions
         (menu_id, action_id, code, description, is_active, created_at, updated_at)
       SELECT menu.id, action.id, 'SCAN_TRACE_VIEW', 'ใช้หน้าสแกน QR ติดตามสถานะ',
              true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
       FROM iam.menus menu
       CROSS JOIN iam.actions action
       WHERE menu.code = 'SCAN_TRACE' AND action.code = 'READ'
       ON CONFLICT (code) DO NOTHING`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM iam.user_department_permissions
       WHERE permission_id IN (SELECT id FROM iam.permissions WHERE code = 'SCAN_TRACE_VIEW')`,
    );
    await queryRunner.query(
      `DELETE FROM iam.department_permissions
       WHERE permission_id IN (SELECT id FROM iam.permissions WHERE code = 'SCAN_TRACE_VIEW')`,
    );
    await queryRunner.query(
      `DELETE FROM iam.permissions WHERE code = 'SCAN_TRACE_VIEW'`,
    );
    const rows = (await queryRunner.query(
      `SELECT sort_order FROM iam.menus WHERE code = 'SCAN_TRACE' AND parent_id IS NULL`,
    )) as unknown as Array<{ sort_order: number | string }>;
    await queryRunner.query(`DELETE FROM iam.menus WHERE code = 'SCAN_TRACE'`);
    if (rows.length) {
      await queryRunner.query(
        `UPDATE iam.menus SET sort_order = sort_order - 1
         WHERE parent_id IS NULL AND sort_order > $1`,
        [Number(rows[0].sort_order)],
      );
    }
  }
}
