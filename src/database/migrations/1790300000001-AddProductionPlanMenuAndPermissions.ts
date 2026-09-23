import { MigrationInterface, QueryRunner } from 'typeorm';

const ACTIONS = [
  { code: 'APPROVE', nameTh: 'อนุมัติ', nameEn: 'Approve', sortOrder: 7 },
  { code: 'ISSUE', nameTh: 'ตัดจ่าย', nameEn: 'Issue', sortOrder: 8 },
] as const;

const PERMISSIONS = [
  ['READ', 'PRODUCTION_PLAN_VIEW'],
  ['CREATE', 'PRODUCTION_PLAN_CREATE'],
  ['UPDATE', 'PRODUCTION_PLAN_UPDATE'],
  ['DELETE', 'PRODUCTION_PLAN_DELETE'],
  ['APPROVE', 'PRODUCTION_PLAN_APPROVE'],
  ['ISSUE', 'PRODUCTION_PLAN_ISSUE'],
  ['CANCEL', 'PRODUCTION_PLAN_CANCEL'],
] as const;

export class AddProductionPlanMenuAndPermissions1790300000001 implements MigrationInterface {
  name = 'AddProductionPlanMenuAndPermissions1790300000001';

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const action of ACTIONS) {
      await queryRunner.query(
        `INSERT INTO iam.actions
           (code, name_th, name_en, sort_order, is_system, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON CONFLICT (code) DO NOTHING`,
        [action.code, action.nameTh, action.nameEn, action.sortOrder],
      );

      await queryRunner.query(
        `INSERT INTO iam.role_actions
           (role_id, action_id, is_active, created_at, updated_at)
         SELECT role.id, action.id, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
         FROM iam.roles role
         CROSS JOIN iam.actions action
         WHERE role.code IN ('SUPER_ADMIN', 'ADMIN')
           AND action.code = $1
         ON CONFLICT (role_id, action_id) DO NOTHING`,
        [action.code],
      );
    }

    await queryRunner.query(`
      INSERT INTO iam.menus
        (code, name_th, name_en, menu_type, path, icon, sort_order,
         is_visible, is_active, created_at, updated_at)
      VALUES
        ('PRODUCTION_PLANS', 'แผนการผลิต', 'Production Plans', 'MAIN',
         '/production/plans', 'clipboard-list', 97,
         true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (code) DO NOTHING
    `);

    for (const [actionCode, permissionCode] of PERMISSIONS) {
      await queryRunner.query(
        `INSERT INTO iam.permissions
           (menu_id, action_id, code, description, is_active, created_at, updated_at)
         SELECT menu.id, action.id, $2, 'แผนการผลิต — ' || $1,
                true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
         FROM iam.menus menu
         CROSS JOIN iam.actions action
         WHERE menu.code = 'PRODUCTION_PLANS'
           AND action.code = $1
         ON CONFLICT (code) DO NOTHING`,
        [actionCode, permissionCode],
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM iam.permissions WHERE code LIKE 'PRODUCTION_PLAN_%'`,
    );
    await queryRunner.query(
      `DELETE FROM iam.menus WHERE code = 'PRODUCTION_PLANS'`,
    );
    for (const action of [...ACTIONS].reverse()) {
      await queryRunner.query(`DELETE FROM iam.actions WHERE code = $1`, [
        action.code,
      ]);
    }
  }
}
