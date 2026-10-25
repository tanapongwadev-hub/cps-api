import { MigrationInterface, QueryRunner } from 'typeorm';

// BOM และขั้นตอนการผลิตเหลือหน้าเดียว: /engineering/setup
// - SETUP_WIZARD เป็นรายการเดียวใน sidebar ("BOM และขั้นตอนการผลิต")
// - BOMS (เดิมชี้ /engineering/bom) กลายเป็นโหนด BUTTON ใต้ SETUP_WIZARD พร้อมลูกของมัน
//   (PRODUCT_WORKFLOW_ACTIONS, MATERIAL_ENGINEERING, MATERIAL_WORKFLOW_ACTIONS) ที่ย้ายตามมา
//   เพราะ BUTTON มีลูกไม่ได้ — sidebar ข้าม BUTTON แต่ menu-tree ยังนับสิทธิ์ BOMS_* / MATERIAL_*
// IDs และ permission grants เดิมไม่เปลี่ยน
export class SingleBomWorkflowPage1790600000051 implements MigrationInterface {
  name = 'SingleBomWorkflowPage1790600000051';

  private async ids(queryRunner: QueryRunner): Promise<Record<string, string>> {
    const rows = (await queryRunner.query(
      `SELECT code, id FROM iam.menus WHERE code IN
        ('BOM_WORKFLOW','SETUP_WIZARD','BOMS','MATERIAL_ENGINEERING','PRODUCT_WORKFLOW_ACTIONS','MATERIAL_WORKFLOW_ACTIONS')`,
    )) as Array<{ code: string; id: string }>;
    return Object.fromEntries(rows.map((r) => [r.code, r.id]));
  }

  async up(queryRunner: QueryRunner): Promise<void> {
    const id = await this.ids(queryRunner);
    if (!id.SETUP_WIZARD || !id.BOMS || !id.BOM_WORKFLOW) return;
    await queryRunner.query(
      `UPDATE iam.menus SET path = '/engineering/setup', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [id.BOM_WORKFLOW],
    );
    await queryRunner.query(
      `UPDATE iam.menus SET name_th = 'BOM และขั้นตอนการผลิต', name_en = 'BOM and Workflow',
              updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [id.SETUP_WIZARD],
    );
    // children of SETUP_WIZARD (all BUTTON): 0..3
    const order: Array<[string | undefined, number]> = [
      [id.PRODUCT_WORKFLOW_ACTIONS, 0],
      [id.MATERIAL_ENGINEERING, 1],
      [id.MATERIAL_WORKFLOW_ACTIONS, 2],
    ];
    for (const [menuId, sort] of order) {
      if (!menuId) continue;
      await queryRunner.query(
        `UPDATE iam.menus SET parent_id = $1, sort_order = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3`,
        [id.SETUP_WIZARD, sort, menuId],
      );
    }
    await queryRunner.query(
      `UPDATE iam.menus SET menu_type = 'BUTTON', parent_id = $1, sort_order = 3, path = NULL,
              updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [id.SETUP_WIZARD, id.BOMS],
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const id = await this.ids(queryRunner);
    if (!id.SETUP_WIZARD || !id.BOMS || !id.BOM_WORKFLOW) return;
    await queryRunner.query(
      `UPDATE iam.menus SET path = '/engineering/bom', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [id.BOM_WORKFLOW],
    );
    await queryRunner.query(
      `UPDATE iam.menus SET name_th = 'สร้างครบชุด', name_en = 'Setup Wizard',
              updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [id.SETUP_WIZARD],
    );
    await queryRunner.query(
      `UPDATE iam.menus SET menu_type = 'SUB', parent_id = $1, sort_order = 1, path = '/engineering/bom',
              updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [id.BOM_WORKFLOW, id.BOMS],
    );
    const order: Array<[string | undefined, number]> = [
      [id.PRODUCT_WORKFLOW_ACTIONS, 0],
      [id.MATERIAL_ENGINEERING, 1],
      [id.MATERIAL_WORKFLOW_ACTIONS, 2],
    ];
    for (const [menuId, sort] of order) {
      if (!menuId) continue;
      await queryRunner.query(
        `UPDATE iam.menus SET parent_id = $1, sort_order = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3`,
        [id.BOMS, sort, menuId],
      );
    }
  }
}
