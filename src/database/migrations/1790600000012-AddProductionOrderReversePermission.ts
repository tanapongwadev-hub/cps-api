import { MigrationInterface, QueryRunner } from 'typeorm';

// กลับรายการ (reverse produce/transfer/close/pack) เดิมใช้สิทธิ์ ADVANCE
// ตอนนี้แยกเป็น PRODUCTION_ORDER_REVERSE; แผนกที่มี ADVANCE อยู่แล้วได้สิทธิ์ใหม่
// ต่อให้ เพื่อไม่ให้พฤติกรรมเดิมเปลี่ยนจนกว่าจะมีคนถอนออก
export class AddProductionOrderReversePermission1790600000012
  implements MigrationInterface
{
  name = 'AddProductionOrderReversePermission1790600000012';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `INSERT INTO iam.actions
         (code, name_th, name_en, sort_order, is_system, is_active, created_at, updated_at)
       VALUES ('REVERSE', 'กลับรายการ', 'Reverse', 11, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT (code) DO NOTHING`,
    );
    await queryRunner.query(
      `INSERT INTO iam.role_actions (role_id, action_id, is_active, created_at, updated_at)
       SELECT role.id, action.id, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
       FROM iam.roles role
       CROSS JOIN iam.actions action
       WHERE role.code IN ('SUPER_ADMIN', 'ADMIN') AND action.code = 'REVERSE'
       ON CONFLICT (role_id, action_id) DO NOTHING`,
    );
    await queryRunner.query(
      `INSERT INTO iam.permissions
         (menu_id, action_id, code, description, is_active, created_at, updated_at)
       SELECT menu.id, action.id, 'PRODUCTION_ORDER_REVERSE', 'กลับรายการการผลิต',
              true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
       FROM iam.menus menu
       CROSS JOIN iam.actions action
       WHERE menu.code = 'PRODUCT_PROCESS_ORDERS' AND action.code = 'REVERSE'
       ON CONFLICT (code) DO NOTHING`,
    );
    await queryRunner.query(
      `INSERT INTO iam.department_permissions
         (permission_id, department_id, is_active, created_at, updated_at)
       SELECT rev.id, dp.department_id, dp.is_active, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
       FROM iam.department_permissions dp
       JOIN iam.permissions adv ON adv.id = dp.permission_id
        AND adv.code = 'PRODUCTION_ORDER_ADVANCE'
       JOIN iam.permissions rev ON rev.code = 'PRODUCTION_ORDER_REVERSE'
       WHERE NOT EXISTS (
         SELECT 1 FROM iam.department_permissions x
         WHERE x.permission_id = rev.id AND x.department_id = dp.department_id)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM iam.department_permissions
       WHERE permission_id IN (SELECT id FROM iam.permissions WHERE code = 'PRODUCTION_ORDER_REVERSE')`,
    );
    await queryRunner.query(
      `DELETE FROM iam.permissions WHERE code = 'PRODUCTION_ORDER_REVERSE'`,
    );
    await queryRunner.query(
      `DELETE FROM iam.role_actions
       WHERE action_id IN (SELECT id FROM iam.actions WHERE code = 'REVERSE')`,
    );
    await queryRunner.query(`DELETE FROM iam.actions WHERE code = 'REVERSE'`);
  }
}
