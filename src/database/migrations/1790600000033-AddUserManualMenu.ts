import { MigrationInterface, QueryRunner } from 'typeorm';

// เมนูคู่มือการใช้งาน (/manuals) — MAIN menu ท้ายสุดของแถบเมนู
// สิทธิ์ USER_MANUAL_VIEW ใช้ action READ และไม่จำกัดแผนก (ไม่มีแถว
// department_permissions) จึงเห็นได้ทุก role ที่มี READ ตามกฎ isAllowedInDepartment
export class AddUserManualMenu1790600000033 implements MigrationInterface {
  name = 'AddUserManualMenu1790600000033';

  async up(queryRunner: QueryRunner): Promise<void> {
    const rows = (await queryRunner.query(
      `SELECT COALESCE(MAX(sort_order), -1) AS max_sort
       FROM iam.menus WHERE parent_id IS NULL`,
    )) as unknown as Array<{ max_sort: number | string }>;
    const nextSortOrder = Number(rows[0]?.max_sort ?? -1) + 1;

    await queryRunner.query(
      `INSERT INTO iam.menus
        (code, name_th, name_en, menu_type, path, icon, sort_order, parent_id,
         is_visible, is_active, created_at, updated_at)
       VALUES
        ('USER_MANUALS', 'คู่มือการใช้งาน', 'User Manuals', 'MAIN', '/manuals',
         'book-open', $1, NULL, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT (code) DO NOTHING`,
      [nextSortOrder],
    );
    await queryRunner.query(
      `INSERT INTO iam.permissions
         (menu_id, action_id, code, description, is_active, created_at, updated_at)
       SELECT menu.id, action.id, 'USER_MANUAL_VIEW', 'ดูคู่มือการใช้งาน',
              true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
       FROM iam.menus menu
       CROSS JOIN iam.actions action
       WHERE menu.code = 'USER_MANUALS' AND action.code = 'READ'
       ON CONFLICT (code) DO NOTHING`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM iam.user_department_permissions
       WHERE permission_id IN (SELECT id FROM iam.permissions WHERE code = 'USER_MANUAL_VIEW')`,
    );
    await queryRunner.query(
      `DELETE FROM iam.department_permissions
       WHERE permission_id IN (SELECT id FROM iam.permissions WHERE code = 'USER_MANUAL_VIEW')`,
    );
    await queryRunner.query(
      `DELETE FROM iam.permissions WHERE code = 'USER_MANUAL_VIEW'`,
    );
    await queryRunner.query(`DELETE FROM iam.menus WHERE code = 'USER_MANUALS'`);
  }
}
