import { MigrationInterface, QueryRunner } from 'typeorm';

// กระบวนการผลิต (process steps) is a simple master that already has a full
// cps-api module (/process-steps) but never got an admin menu or permission
// rows. Same pattern as 1790200000001 (Location/ProcessLine).
export class AddProcessStepMenuAndPermissions1790600000002
  implements MigrationInterface
{
  name = 'AddProcessStepMenuAndPermissions1790600000002';

  private readonly verbToActionCode: Record<string, string> = {
    VIEW: 'READ',
    CREATE: 'CREATE',
    UPDATE: 'UPDATE',
    DELETE: 'DELETE',
  };

  async up(queryRunner: QueryRunner): Promise<void> {
    const parent = await queryRunner.query(
      `SELECT id FROM iam.menus WHERE code = 'MASTER DATA' AND menu_type = 'MAIN'`,
    );
    if (parent.length === 0) {
      throw new Error(
        "'MASTER DATA' parent menu not found — run the base seed before this migration",
      );
    }
    const parentId = parent[0].id;

    const existing = await queryRunner.query(
      `SELECT id FROM iam.menus WHERE code = 'PROCESS_STEP_MANAGEMENT'`,
    );
    if (existing.length > 0) return;

    // Append after live siblings (live sort_order is renumbered by /menus).
    const sibling = (await queryRunner.query(
      `SELECT COALESCE(MAX(sort_order), -1) AS max_sort FROM iam.menus WHERE parent_id = $1`,
      [parentId],
    )) as unknown as Array<{ max_sort: number | string }>;
    const sortOrder = Number(sibling[0]?.max_sort ?? -1) + 1;

    const menu = await queryRunner.query(
      `INSERT INTO iam.menus (parent_id, code, name_th, name_en, path, icon, menu_type, sort_order, is_active, is_visible, created_at, updated_at)
       VALUES ($1, 'PROCESS_STEP_MANAGEMENT', 'จัดการกระบวนการผลิต', 'Process Step Management',
               '/master-data/process-steps', 'workflow', 'SUB', $2, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING id`,
      [parentId, sortOrder],
    );

    for (const [verb, actionCode] of Object.entries(this.verbToActionCode)) {
      const action = await queryRunner.query(
        `SELECT id FROM iam.actions WHERE code = $1`,
        [actionCode],
      );
      if (action.length === 0) {
        throw new Error(`iam.actions row for '${actionCode}' not found`);
      }
      await queryRunner.query(
        `INSERT INTO iam.permissions (menu_id, action_id, code, description, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON CONFLICT (code) DO NOTHING`,
        [
          menu[0].id,
          action[0].id,
          `PROCESS_STEP_${verb}`,
          `จัดการกระบวนการผลิต — ${verb}`,
        ],
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM iam.permissions WHERE code LIKE 'PROCESS_STEP_%'`,
    );
    await queryRunner.query(
      `DELETE FROM iam.menus WHERE code = 'PROCESS_STEP_MANAGEMENT'`,
    );
  }
}
