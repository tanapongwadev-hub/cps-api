import { MigrationInterface, QueryRunner } from 'typeorm';

// ลบเมนู "รายการ BOM / Workflow" (1790600000044) และเปิดเมนู "สร้างครบชุด" ให้ทุก role เห็นได้
// (ขอบเขต ALL): ผู้ใช้ทั่วไปเห็นรายการแบบอ่านอย่างเดียว ส่วนการสร้าง/แก้ไข/ลบเป็นของ SUPER_ADMIN เท่านั้น
// (บังคับที่หน้าและที่ API ของ setup-wizard drafts)
export class RemoveBomOverviewOpenSetupWizardToAll1790600000045 implements MigrationInterface {
  name = 'RemoveBomOverviewOpenSetupWizardToAll1790600000045';

  async up(queryRunner: QueryRunner): Promise<void> {
    const parent = (await queryRunner.query(
      `SELECT id FROM iam.menus WHERE code = 'BOM_WORKFLOW'`,
    )) as Array<{ id: string }>;
    await queryRunner.query(
      `DELETE FROM iam.user_department_permissions WHERE permission_id IN (SELECT id FROM iam.permissions WHERE code = 'BOM_OVERVIEW_VIEW')`,
    );
    await queryRunner.query(
      `DELETE FROM iam.department_permissions WHERE permission_id IN (SELECT id FROM iam.permissions WHERE code = 'BOM_OVERVIEW_VIEW')`,
    );
    await queryRunner.query(`DELETE FROM iam.permissions WHERE code = 'BOM_OVERVIEW_VIEW'`);
    await queryRunner.query(`DELETE FROM iam.menus WHERE code = 'BOM_OVERVIEW'`);
    if (parent[0]) {
      // BOM_OVERVIEW was sort 0; close the gap so siblings stay contiguous from 0.
      await queryRunner.query(
        `UPDATE iam.menus SET sort_order = sort_order - 1 WHERE parent_id = $1 AND sort_order > 0`,
        [parent[0].id],
      );
    }
    await queryRunner.query(
      `DELETE FROM iam.department_permissions WHERE permission_id IN (SELECT id FROM iam.permissions WHERE code = 'SETUP_WIZARD_VIEW')`,
    );
    await queryRunner.query(`UPDATE iam.permissions SET access_scope = 'ALL' WHERE code = 'SETUP_WIZARD_VIEW'`);
  }

  async down(): Promise<void> {
    // Not reversible on purpose (the removed menu/permission would need re-seeding via migration 1790600000044).
  }
}
