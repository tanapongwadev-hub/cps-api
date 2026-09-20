import { MigrationInterface, QueryRunner } from 'typeorm';

export class ReorderMaterialsPcOverviewMenu1786700000014
  implements MigrationInterface
{
  name = 'ReorderMaterialsPcOverviewMenu1786700000014';

  // Follow-up to 1786700000013-AddMaterialsPcOverviewMenu.ts. That migration
  // set the new menu's sort_order from seed.ts's static value (85), but the
  // live siblings under MATERIALS_MANAGEMENTS had already been renumbered to
  // a contiguous 0-based sequence by the /menus drag-and-drop reorder
  // feature (see AGENTS.md § Menu management — cps-api's own
  // validateAndProjectMenuLayout requires contiguous 0-based sort_order per
  // parent). 85 landed the new row last instead of first as intended, and
  // broke that contiguity invariant for a future reorder save. This shifts
  // the 3 existing siblings up by one and puts the new menu at position 0.
  async up(queryRunner: QueryRunner): Promise<void> {
    const parent = await queryRunner.query(
      `SELECT id FROM iam.menus WHERE code = 'MATERIALS_MANAGEMENTS'`,
    );
    if (parent.length === 0) return;
    const parentId = parent[0].id;

    await queryRunner.query(
      `UPDATE iam.menus SET sort_order = sort_order + 1
       WHERE parent_id = $1 AND code != 'MATERIALS_PC_OVERVIEW'`,
      [parentId],
    );
    await queryRunner.query(
      `UPDATE iam.menus SET sort_order = 0
       WHERE parent_id = $1 AND code = 'MATERIALS_PC_OVERVIEW'`,
      [parentId],
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const parent = await queryRunner.query(
      `SELECT id FROM iam.menus WHERE code = 'MATERIALS_MANAGEMENTS'`,
    );
    if (parent.length === 0) return;
    const parentId = parent[0].id;

    await queryRunner.query(
      `UPDATE iam.menus SET sort_order = sort_order - 1
       WHERE parent_id = $1 AND code != 'MATERIALS_PC_OVERVIEW'`,
      [parentId],
    );
    await queryRunner.query(
      `UPDATE iam.menus SET sort_order = 85
       WHERE parent_id = $1 AND code = 'MATERIALS_PC_OVERVIEW'`,
      [parentId],
    );
  }
}
