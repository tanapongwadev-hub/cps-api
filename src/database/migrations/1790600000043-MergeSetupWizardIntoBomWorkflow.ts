import { MigrationInterface, QueryRunner } from 'typeorm';

// รวมเมนู "สร้างครบชุด" (/engineering/setup) เข้ากับ "BOM และขั้นตอนการผลิต" (/engineering/bom)
// เป็นเมนูย่อยตัวแรก สิทธิ์ยังเป็น SUPER_ADMIN เท่านั้น (SETUP_WIZARD_VIEW ไม่ถูกแตะ)
export class MergeSetupWizardIntoBomWorkflow1790600000043 implements MigrationInterface {
  name = 'MergeSetupWizardIntoBomWorkflow1790600000043';

  async up(queryRunner: QueryRunner): Promise<void> {
    const parent = (await queryRunner.query(
      `SELECT id FROM iam.menus WHERE code = 'BOM_WORKFLOW'`,
    )) as Array<{ id: string }>;
    if (!parent[0]) return;
    // Keep sibling sort_order contiguous from 0: new first child shifts the rest.
    await queryRunner.query(
      `UPDATE iam.menus SET sort_order = sort_order + 1 WHERE parent_id = $1 AND code <> 'SETUP_WIZARD'`,
      [parent[0].id],
    );
    await queryRunner.query(
      `UPDATE iam.menus
       SET parent_id = $1, menu_type = 'SUB', sort_order = 0, updated_at = CURRENT_TIMESTAMP
       WHERE code = 'SETUP_WIZARD'`,
      [parent[0].id],
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const parent = (await queryRunner.query(
      `SELECT id FROM iam.menus WHERE code = 'BOM_WORKFLOW'`,
    )) as Array<{ id: string }>;
    if (!parent[0]) return;
    const next = (await queryRunner.query(
      `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM iam.menus WHERE parent_id IS NULL`,
    )) as Array<{ next: number }>;
    await queryRunner.query(
      `UPDATE iam.menus SET parent_id = NULL, menu_type = 'MAIN', sort_order = $1, updated_at = CURRENT_TIMESTAMP
       WHERE code = 'SETUP_WIZARD'`,
      [next[0].next],
    );
    await queryRunner.query(
      `UPDATE iam.menus SET sort_order = sort_order - 1 WHERE parent_id = $1`,
      [parent[0].id],
    );
  }
}
