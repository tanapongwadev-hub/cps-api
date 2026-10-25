import { MigrationInterface, QueryRunner } from 'typeorm';

// คู่มือวิดีโอเหลือเมนูเดียว (VIDEO_MANUALS → /manuals/videos) แสดงเป็นการ์ดในหน้าเดียว
// จึงลบเมนูย่อย 1 / 1.1 / 1.2 และสิทธิ์ของเมนูเหล่านั้นออก
const REMOVED = [
  { code: 'VIDEO_MANUAL_LOGIN_SINGLE', perm: 'VIDEO_MANUAL_LOGIN_SINGLE_VIEW', th: '1.1 ผู้ใช้ที่มี 1 แผนก', en: '1.1 Single department', path: '/manuals/videos/login-single-department', sort: 0, parent: 'VIDEO_MANUAL_LOGIN' },
  { code: 'VIDEO_MANUAL_LOGIN_MULTI', perm: 'VIDEO_MANUAL_LOGIN_MULTI_VIEW', th: '1.2 ผู้ใช้ที่มีมากกว่า 1 แผนก', en: '1.2 Multiple departments', path: '/manuals/videos/login-multi-department', sort: 1, parent: 'VIDEO_MANUAL_LOGIN' },
  { code: 'VIDEO_MANUAL_LOGIN', perm: 'VIDEO_MANUAL_LOGIN_VIEW', th: '1. เข้าสู่ระบบ', en: '1. Login', path: null, sort: 0, parent: 'VIDEO_MANUALS' },
] as const;

export class RemoveVideoManualSubMenus1790600000047 implements MigrationInterface {
  name = 'RemoveVideoManualSubMenus1790600000047';

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const menu of REMOVED) {
      await queryRunner.query(
        `DELETE FROM iam.user_department_permissions WHERE permission_id IN (SELECT id FROM iam.permissions WHERE code = $1)`,
        [menu.perm],
      );
      await queryRunner.query(
        `DELETE FROM iam.department_permissions WHERE permission_id IN (SELECT id FROM iam.permissions WHERE code = $1)`,
        [menu.perm],
      );
      await queryRunner.query(`DELETE FROM iam.permissions WHERE code = $1`, [menu.perm]);
      await queryRunner.query(`DELETE FROM iam.menus WHERE code = $1`, [menu.code]);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const menu of [...REMOVED].reverse()) {
      await queryRunner.query(
        `INSERT INTO iam.menus
          (code, name_th, name_en, menu_type, path, icon, sort_order, parent_id,
           is_visible, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, 'SUB', $4, 'video', $5,
           (SELECT id FROM iam.menus WHERE code = $6),
           true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON CONFLICT (code) DO NOTHING`,
        [menu.code, menu.th, menu.en, menu.path, menu.sort, menu.parent],
      );
      await queryRunner.query(
        `INSERT INTO iam.permissions
           (menu_id, action_id, code, description, access_scope, is_active, created_at, updated_at)
         SELECT m.id, a.id, $2, $3, 'ALL', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
         FROM iam.menus m CROSS JOIN iam.actions a
         WHERE m.code = $1 AND a.code = 'READ'
         ON CONFLICT (code) DO NOTHING`,
        [menu.code, menu.perm, `ดูวิดีโอ ${menu.th}`],
      );
    }
  }
}
