import { MigrationInterface, QueryRunner } from 'typeorm';

// สิทธิ์ดูยอดวัสดุคงเหลืออย่างเดียว (MATERIAL_STOCK_VIEW) แยกจาก MATERIALS_RECEIVING_VIEW
// เพื่อให้กลุ่มผลิต (PRO) เห็นยอดคงเหลือโดยไม่ต้องได้สิทธิ์ของงานรับเข้า
// - action ใหม่ STOCK_VIEW มอบให้ role ทุกตัวที่มี action READ
// - permission อยู่ใต้เมนู MATERIALS_MANAGEMENTS ขอบเขต DEPARTMENTS = วัสดุ (MAT) + ผลิต (PRO)
// - คืนค่า MATERIALS_RECEIVING_VIEW ให้เหลือเฉพาะกลุ่มวัสดุ (MAT)
export class AddMaterialStockViewPermission1790600000040
  implements MigrationInterface
{
  name = 'AddMaterialStockViewPermission1790600000040';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `INSERT INTO iam.actions (code, name_th, name_en, sort_order, is_system, is_active, created_at, updated_at)
       SELECT 'STOCK_VIEW', 'ดูยอดคงเหลือ', 'View stock', COALESCE(MAX(sort_order), 0) + 1, true, true,
              CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
       FROM iam.actions
       ON CONFLICT (code) DO NOTHING`,
    );
    await queryRunner.query(
      `INSERT INTO iam.role_actions (role_id, action_id, is_active, created_at, updated_at)
       SELECT DISTINCT ra.role_id, stock.id, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
       FROM iam.role_actions ra
       JOIN iam.actions read_action ON read_action.id = ra.action_id AND read_action.code = 'READ'
       CROSS JOIN (SELECT id FROM iam.actions WHERE code = 'STOCK_VIEW') stock
       WHERE ra.is_active
       ON CONFLICT DO NOTHING`,
    );

    const inserted = (await queryRunner.query(
      `INSERT INTO iam.permissions
         (menu_id, action_id, code, description, access_scope, is_active, created_at, updated_at)
       SELECT menu.id, action.id, 'MATERIAL_STOCK_VIEW',
              'ดูยอดวัสดุคงเหลือ (ไม่รวมงานรับเข้า)', 'DEPARTMENTS', true,
              CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
       FROM iam.menus menu CROSS JOIN iam.actions action
       WHERE menu.code = 'MATERIALS_MANAGEMENTS' AND action.code = 'STOCK_VIEW'
       ON CONFLICT (code) DO NOTHING
       RETURNING id`,
    )) as Array<{ id: string }>;
    const permissionId = inserted[0]?.id;
    if (permissionId) {
      await queryRunner.query(
        `INSERT INTO iam.department_permissions
           (permission_id, department_id, is_active, created_at, updated_at)
         SELECT $1::bigint, d.id, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
         FROM iam.departments d WHERE d.code IN ('MAT', 'PRO')
         ON CONFLICT (permission_id, department_id) DO NOTHING`,
        [permissionId],
      );
    }

    // Receiving documents stay with the materials group only.
    await queryRunner.query(
      `DELETE FROM iam.department_permissions
       WHERE permission_id = (SELECT id FROM iam.permissions WHERE code = 'MATERIALS_RECEIVING_VIEW')
         AND department_id = (SELECT id FROM iam.departments WHERE code = 'PRO')`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM iam.user_department_permissions
       WHERE permission_id IN (SELECT id FROM iam.permissions WHERE code = 'MATERIAL_STOCK_VIEW')`,
    );
    await queryRunner.query(
      `DELETE FROM iam.department_permissions
       WHERE permission_id IN (SELECT id FROM iam.permissions WHERE code = 'MATERIAL_STOCK_VIEW')`,
    );
    await queryRunner.query(`DELETE FROM iam.permissions WHERE code = 'MATERIAL_STOCK_VIEW'`);
    await queryRunner.query(
      `DELETE FROM iam.role_actions
       WHERE action_id IN (SELECT id FROM iam.actions WHERE code = 'STOCK_VIEW')`,
    );
    await queryRunner.query(`DELETE FROM iam.actions WHERE code = 'STOCK_VIEW'`);
  }
}
