import { MigrationInterface, QueryRunner } from 'typeorm';

// BOM และขั้นตอนการผลิตเหลือหน้าเดียว (/engineering/bom): sidebar เหลือรายการเดียว
// - BOMS เป็นรายการเดียวที่เห็น (ชื่อ/ path ใหม่)
// - MATERIAL_ENGINEERING เปลี่ยนเป็นโหนด BUTTON ใต้ BOMS (sidebar ข้าม BUTTON แต่ menu-tree
//   ยังรวมโหนดนี้และ permission MATERIAL_BOMS_* ไว้ ทำให้ผู้มีสิทธิ์เฉพาะวัสดุยังเห็นเมนู BOM)
// - MATERIAL_WORKFLOW_ACTIONS (BUTTON ลูกของ MATERIAL_ENGINEERING) ย้ายขึ้นไปอยู่ใต้ BOMS
//   เพราะ BUTTON มีลูกไม่ได้ IDs / permission grants เดิมไม่เปลี่ยน
export class MergeBomWorkflowMenus1790600000050 implements MigrationInterface {
  name = 'MergeBomWorkflowMenus1790600000050';

  async up(queryRunner: QueryRunner): Promise<void> {
    const rows = (await queryRunner.query(
      `SELECT code, id FROM iam.menus WHERE code IN ('BOMS','MATERIAL_ENGINEERING','MATERIAL_WORKFLOW_ACTIONS','PRODUCT_WORKFLOW_ACTIONS')`,
    )) as Array<{ code: string; id: string }>;
    const id = Object.fromEntries(rows.map((r) => [r.code, r.id]));
    if (!id.BOMS || !id.MATERIAL_ENGINEERING) return;

    await queryRunner.query(
      `UPDATE iam.menus
          SET name_th = 'BOM และขั้นตอนการผลิต', name_en = 'BOM and Workflow',
              path = '/engineering/bom', updated_at = CURRENT_TIMESTAMP
        WHERE id = $1`,
      [id.BOMS],
    );
    // children of BOMS: PRODUCT_WORKFLOW_ACTIONS(0), MATERIAL_ENGINEERING(1), MATERIAL_WORKFLOW_ACTIONS(2)
    await queryRunner.query(
      `UPDATE iam.menus
          SET menu_type = 'BUTTON', parent_id = $1, sort_order = 1, path = NULL,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $2`,
      [id.BOMS, id.MATERIAL_ENGINEERING],
    );
    if (id.MATERIAL_WORKFLOW_ACTIONS) {
      await queryRunner.query(
        `UPDATE iam.menus SET parent_id = $1, sort_order = 2, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
        [id.BOMS, id.MATERIAL_WORKFLOW_ACTIONS],
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const rows = (await queryRunner.query(
      `SELECT code, id FROM iam.menus WHERE code IN ('BOMS','MATERIAL_ENGINEERING','MATERIAL_WORKFLOW_ACTIONS','BOM_WORKFLOW')`,
    )) as Array<{ code: string; id: string }>;
    const id = Object.fromEntries(rows.map((r) => [r.code, r.id]));
    if (!id.BOMS || !id.MATERIAL_ENGINEERING || !id.BOM_WORKFLOW) return;
    await queryRunner.query(
      `UPDATE iam.menus
          SET name_th = 'BOM และขั้นตอนการผลิตสินค้า', name_en = 'Product BOM and Workflow',
              path = '/engineering/bom/products', updated_at = CURRENT_TIMESTAMP
        WHERE id = $1`,
      [id.BOMS],
    );
    await queryRunner.query(
      `UPDATE iam.menus
          SET menu_type = 'SUB', parent_id = $1, sort_order = 2, path = '/engineering/bom/materials',
              name_th = 'BOM และขั้นตอนการผลิตวัสดุ', name_en = 'Material BOM and Workflow',
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $2`,
      [id.BOM_WORKFLOW, id.MATERIAL_ENGINEERING],
    );
    if (id.MATERIAL_WORKFLOW_ACTIONS) {
      await queryRunner.query(
        `UPDATE iam.menus SET parent_id = $1, sort_order = 0, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
        [id.MATERIAL_ENGINEERING, id.MATERIAL_WORKFLOW_ACTIONS],
      );
    }
  }
}
