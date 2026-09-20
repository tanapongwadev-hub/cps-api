import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMaterialsPcOverviewMenu1786700000013 implements MigrationInterface {
  name = 'AddMaterialsPcOverviewMenu1786700000013';

  async up(queryRunner: QueryRunner): Promise<void> {
    // The real Materials CRUD page (admin-dashboard's /materials/pc — create/
    // edit/disable a material) has never had its own sidebar entry. It was
    // only reachable via links inside the /materials control-tower dashboard
    // (MATERIALS_MANAGEMENTS, below) or the "รับเข้า" button on other pages.
    // Adds it as a child ("ภาพรวมวัตถุดิบ") of the existing จัดการวัสดุ
    // (/materials) menu, sorted before the existing รับเข้าวัตถุดิบ submenu.
    const parent = await queryRunner.query(
      `SELECT id FROM iam.menus WHERE code = 'MATERIALS_MANAGEMENTS'`,
    );
    if (parent.length === 0) {
      throw new Error(
        'MATERIALS_MANAGEMENTS menu not found — run the base seed before this migration',
      );
    }
    const parentId = parent[0].id;

    const existing = await queryRunner.query(
      `SELECT id FROM iam.menus WHERE code = 'MATERIALS_PC_OVERVIEW'`,
    );
    if (existing.length === 0) {
      await queryRunner.query(
        `INSERT INTO iam.menus
          (code, name_th, name_en, menu_type, path, icon, sort_order, parent_id, is_visible, is_active, created_at, updated_at)
         VALUES
          ('MATERIALS_PC_OVERVIEW', 'ภาพรวมวัตถุดิบ', 'Materials Overview', 'SUB', '/materials/pc', 'gauge', 85, $1, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [parentId],
      );
    }

    // No new permission row is created here on purpose — this menu maps to
    // the exact same page/permission as MATERIALS_MANAGEMENTS itself
    // (MATERIAL_VIEW, already seeded), so it reuses that code rather than
    // minting a parallel one nothing checks. Same pattern already used by
    // MATERIALS_RECEIVING_REPORT/MATERIALS_DISBURSEMENT_REPORT/
    // MATERIALS_REPORT reusing their sibling menu's own VIEW permission —
    // see src/database/seeds/permission-registry.ts.
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const menu = await queryRunner.query(
      `SELECT id FROM iam.menus WHERE code = 'MATERIALS_PC_OVERVIEW'`,
    );
    if (menu.length > 0) {
      // Defensive — no permission row is expected to reference this menu
      // (see the note in up()), but clear any just in case a later reseed
      // ever changes that assumption.
      await queryRunner.query(
        `DELETE FROM iam.permissions WHERE menu_id = $1`,
        [menu[0].id],
      );
      await queryRunner.query(`DELETE FROM iam.menus WHERE id = $1`, [
        menu[0].id,
      ]);
    }
  }
}
