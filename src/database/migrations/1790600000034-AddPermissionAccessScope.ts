import { MigrationInterface, QueryRunner } from 'typeorm';

// เพิ่มขอบเขตของ permission: ALL = ทุกแผนก (ไม่ดู department_permissions),
// DEPARTMENTS = เฉพาะแผนกที่ผูกไว้ (รายการว่าง = ไม่มีแผนกไหนใช้ได้)
// ข้อมูลเดิมเป็น ALL ยกเว้น permission ที่มีแถวผูกแผนกที่ active อยู่แล้ว
// ซึ่งเดิมถูกจำกัดตามแผนกอยู่ จึงตั้งเป็น DEPARTMENTS เพื่อคงพฤติกรรมเดิม
// ดู docs/plans/2026-10-17-permission-management-plan.md (admin-dashboard)
export class AddPermissionAccessScope1790600000034
  implements MigrationInterface
{
  name = 'AddPermissionAccessScope1790600000034';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE iam.permissions
         ADD COLUMN IF NOT EXISTS access_scope varchar(12) NOT NULL DEFAULT 'ALL'`,
    );
    await queryRunner.query(
      `ALTER TABLE iam.permissions
         ADD CONSTRAINT chk_permissions_access_scope
         CHECK (access_scope IN ('ALL', 'DEPARTMENTS'))`,
    );
    await queryRunner.query(
      `UPDATE iam.permissions p
          SET access_scope = 'DEPARTMENTS'
        WHERE EXISTS (
          SELECT 1 FROM iam.department_permissions dp
           WHERE dp.permission_id = p.id AND dp.is_active
        )`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // A DEPARTMENTS permission with no active mapping meant "nobody"; the old
    // rule reads an empty list as "everybody", so refuse to silently widen it.
    const rows = (await queryRunner.query(
      `SELECT p.code FROM iam.permissions p
        WHERE p.access_scope = 'DEPARTMENTS'
          AND NOT EXISTS (
            SELECT 1 FROM iam.department_permissions dp
             WHERE dp.permission_id = p.id AND dp.is_active
          )`,
    )) as Array<{ code: string }>;
    if (rows.length > 0) {
      throw new Error(
        `Cannot revert: permissions closed to every department would become open to all: ${rows
          .map((row) => row.code)
          .join(', ')}`,
      );
    }
    // ALL permissions with leftover active mappings would become restricted.
    await queryRunner.query(
      `UPDATE iam.department_permissions dp
          SET is_active = false, updated_at = CURRENT_TIMESTAMP
         FROM iam.permissions p
        WHERE dp.permission_id = p.id
          AND p.access_scope = 'ALL'
          AND dp.is_active`,
    );
    await queryRunner.query(
      `ALTER TABLE iam.permissions DROP CONSTRAINT IF EXISTS chk_permissions_access_scope`,
    );
    await queryRunner.query(
      `ALTER TABLE iam.permissions DROP COLUMN IF EXISTS access_scope`,
    );
  }
}
