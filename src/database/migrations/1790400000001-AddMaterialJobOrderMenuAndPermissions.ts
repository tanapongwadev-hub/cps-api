import { MigrationInterface, QueryRunner } from 'typeorm';

const ACTIONS = [
  { code: 'PRINT', nameTh: 'พิมพ์', nameEn: 'Print', sortOrder: 9 },
  { code: 'PICK', nameTh: 'หยิบสินค้า', nameEn: 'Pick', sortOrder: 10 },
] as const;

const PERMISSIONS = [
  ['READ', 'MATERIAL_JOB_ORDER_VIEW'],
  ['PRINT', 'MATERIAL_JOB_ORDER_PRINT'],
  ['PICK', 'MATERIAL_JOB_ORDER_PICK'],
  ['ISSUE', 'MATERIAL_JOB_ORDER_ISSUE'],
] as const;

export class AddMaterialJobOrderMenuAndPermissions1790400000001
  implements MigrationInterface
{
  name = 'AddMaterialJobOrderMenuAndPermissions1790400000001';

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

    // ISSUE action already exists (created for PRODUCTION_PLANS) — reused here.

    const siblingRows = (await queryRunner.query(
      `SELECT COALESCE(MAX(sort_order), -1) AS max_sort
       FROM iam.menus
       WHERE parent_id = (SELECT id FROM iam.menus WHERE code = 'MATERIALS_MANAGEMENTS')`,
    )) as unknown as Array<{ max_sort: number | string }>;
    const nextSortOrder = Number(siblingRows[0]?.max_sort ?? -1) + 1;

    await queryRunner.query(
      `INSERT INTO iam.menus
        (code, name_th, name_en, menu_type, path, icon, sort_order, parent_id,
         is_visible, is_active, created_at, updated_at)
       SELECT
        'MATERIAL_JOB_ORDERS', 'ใบจัดงาน', 'Job Orders', 'SUB',
        '/materials/job-orders', 'clipboard-check', $1, parent.id,
        true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
       FROM iam.menus parent
       WHERE parent.code = 'MATERIALS_MANAGEMENTS'
       ON CONFLICT (code) DO NOTHING`,
      [nextSortOrder],
    );

    for (const [actionCode, permissionCode] of PERMISSIONS) {
      await queryRunner.query(
        `INSERT INTO iam.permissions
           (menu_id, action_id, code, description, is_active, created_at, updated_at)
         SELECT menu.id, action.id, $2, 'ใบจัดงาน — ' || $1,
                true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
         FROM iam.menus menu
         CROSS JOIN iam.actions action
         WHERE menu.code = 'MATERIAL_JOB_ORDERS'
           AND action.code = $1
         ON CONFLICT (code) DO NOTHING`,
        [actionCode, permissionCode],
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM iam.permissions WHERE code LIKE 'MATERIAL_JOB_ORDER_%'`,
    );
    await queryRunner.query(
      `DELETE FROM iam.menus WHERE code = 'MATERIAL_JOB_ORDERS'`,
    );
    for (const action of [...ACTIONS].reverse()) {
      await queryRunner.query(`DELETE FROM iam.actions WHERE code = $1`, [
        action.code,
      ]);
    }
  }
}
