import { MigrationInterface, QueryRunner } from 'typeorm';

// เมนู "คู่มือการใช้งานแบบวิดีโอ" (MAIN) → 1. เข้าสู่ระบบ (หัวข้อ ไม่มี path)
// → 1.1 ผู้ใช้ 1 แผนก, 1.2 ผู้ใช้มากกว่า 1 แผนก. ทุกเมนูใช้ action READ ขอบเขต ALL
// (ทุก role ที่มี READ เห็น) เหมือน USER_MANUAL_VIEW
const MENUS = [
  { code: 'VIDEO_MANUALS', th: 'คู่มือการใช้งานแบบวิดีโอ', en: 'Video Manuals', type: 'MAIN', path: '/manuals/videos', icon: 'video', parent: null, sort: null, perm: 'VIDEO_MANUAL_VIEW', desc: 'ดูคู่มือการใช้งานแบบวิดีโอ' },
  { code: 'VIDEO_MANUAL_LOGIN', th: '1. เข้าสู่ระบบ', en: '1. Login', type: 'SUB', path: null, icon: 'video', parent: 'VIDEO_MANUALS', sort: 0, perm: 'VIDEO_MANUAL_LOGIN_VIEW', desc: 'ดูหัวข้อวิดีโอการเข้าสู่ระบบ' },
  { code: 'VIDEO_MANUAL_LOGIN_SINGLE', th: '1.1 ผู้ใช้ที่มี 1 แผนก', en: '1.1 Single department', type: 'SUB', path: '/manuals/videos/login-single-department', icon: 'video', parent: 'VIDEO_MANUAL_LOGIN', sort: 0, perm: 'VIDEO_MANUAL_LOGIN_SINGLE_VIEW', desc: 'ดูวิดีโอการเข้าสู่ระบบสำหรับผู้ใช้ที่มี 1 แผนก' },
  { code: 'VIDEO_MANUAL_LOGIN_MULTI', th: '1.2 ผู้ใช้ที่มีมากกว่า 1 แผนก', en: '1.2 Multiple departments', type: 'SUB', path: '/manuals/videos/login-multi-department', icon: 'video', parent: 'VIDEO_MANUAL_LOGIN', sort: 1, perm: 'VIDEO_MANUAL_LOGIN_MULTI_VIEW', desc: 'ดูวิดีโอการเข้าสู่ระบบสำหรับผู้ใช้ที่มีมากกว่า 1 แผนก' },
] as const;

export class AddVideoManualMenus1790600000046 implements MigrationInterface {
  name = 'AddVideoManualMenus1790600000046';

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const menu of MENUS) {
      let sortOrder: number = menu.sort ?? 0;
      if (menu.sort === null) {
        const rows = (await queryRunner.query(
          `SELECT COALESCE(MAX(sort_order), -1) AS max_sort FROM iam.menus WHERE parent_id IS NULL`,
        )) as Array<{ max_sort: number | string }>;
        sortOrder = Number(rows[0]?.max_sort ?? -1) + 1;
      }
      await queryRunner.query(
        `INSERT INTO iam.menus
          (code, name_th, name_en, menu_type, path, icon, sort_order, parent_id,
           is_visible, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7,
           (SELECT id FROM iam.menus WHERE code = $8),
           true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON CONFLICT (code) DO NOTHING`,
        [menu.code, menu.th, menu.en, menu.type, menu.path, menu.icon, sortOrder, menu.parent],
      );
      await queryRunner.query(
        `INSERT INTO iam.permissions
           (menu_id, action_id, code, description, access_scope, is_active, created_at, updated_at)
         SELECT m.id, a.id, $2, $3, 'ALL', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
         FROM iam.menus m CROSS JOIN iam.actions a
         WHERE m.code = $1 AND a.code = 'READ'
         ON CONFLICT (code) DO NOTHING`,
        [menu.code, menu.perm, menu.desc],
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const menu of [...MENUS].reverse()) {
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
}
