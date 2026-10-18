import { MigrationInterface, QueryRunner } from 'typeorm';

// "สร้างครบชุด" เป็นเมนูหลัก (MAIN) ของตัวเอง และเปิดให้เฉพาะ SUPER_ADMIN
// (SETUP_WIZARD_VIEW เป็น DEPARTMENTS แต่ไม่มีแผนกใดได้สิทธิ์ — SUPER_ADMIN ผ่านเสมอ)
export class MoveSetupWizardToMainMenu1790600000042 implements MigrationInterface {
  name = 'MoveSetupWizardToMainMenu1790600000042';

  async up(queryRunner: QueryRunner): Promise<void> {
    const next = (await queryRunner.query(
      `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM iam.menus WHERE parent_id IS NULL`,
    )) as Array<{ next: number }>;
    await queryRunner.query(
      `UPDATE iam.menus
       SET parent_id = NULL, menu_type = 'MAIN', sort_order = $1, updated_at = CURRENT_TIMESTAMP
       WHERE code = 'SETUP_WIZARD'`,
      [next[0].next],
    );
    await queryRunner.query(
      `UPDATE iam.permissions SET access_scope = 'DEPARTMENTS', updated_at = CURRENT_TIMESTAMP
       WHERE code = 'SETUP_WIZARD_VIEW'`,
    );
    await queryRunner.query(
      `DELETE FROM iam.department_permissions
       WHERE permission_id IN (SELECT id FROM iam.permissions WHERE code = 'SETUP_WIZARD_VIEW')`,
    );
    await queryRunner.query(
      `DELETE FROM iam.user_department_permissions
       WHERE permission_id IN (SELECT id FROM iam.permissions WHERE code = 'SETUP_WIZARD_VIEW')`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const parent = (await queryRunner.query(
      `SELECT id FROM iam.menus WHERE code = 'PRODUCT_ENGINEERING'`,
    )) as Array<{ id: string }>;
    if (!parent[0]) return;
    const next = (await queryRunner.query(
      `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM iam.menus WHERE parent_id = $1`,
      [parent[0].id],
    )) as Array<{ next: number }>;
    await queryRunner.query(
      `UPDATE iam.menus SET parent_id = $1, menu_type = 'SUB', sort_order = $2, updated_at = CURRENT_TIMESTAMP
       WHERE code = 'SETUP_WIZARD'`,
      [parent[0].id, next[0].next],
    );
  }
}
