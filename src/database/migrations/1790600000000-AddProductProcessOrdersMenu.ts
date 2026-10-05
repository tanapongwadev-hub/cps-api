import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductProcessOrdersMenu1790600000000
  implements MigrationInterface
{
  name = 'AddProductProcessOrdersMenu1790600000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const parent = await queryRunner.query(
      `SELECT id FROM iam.menus WHERE code = 'PRODUCTS_LIST'`,
    );
    if (parent.length === 0) {
      throw new Error(
        'PRODUCTS_LIST menu not found — run the base seed before this migration',
      );
    }

    // Append after the existing siblings (live sort_order is contiguous 0-based
    // per parent after /menus reordering — never trust the seed constant).
    const siblingRows = (await queryRunner.query(
      `SELECT COALESCE(MAX(sort_order), -1) AS max_sort
       FROM iam.menus WHERE parent_id = $1`,
      [parent[0].id],
    )) as unknown as Array<{ max_sort: number | string }>;
    const nextSortOrder = Number(siblingRows[0]?.max_sort ?? -1) + 1;

    await queryRunner.query(
      `INSERT INTO iam.menus
        (code, name_th, name_en, menu_type, path, icon, sort_order, parent_id,
         is_visible, is_active, created_at, updated_at)
       VALUES
        ('PRODUCT_PROCESS_ORDERS', 'การสั่งผลิตตามกระบวนการ', 'Process Production Orders',
         'SUB', '/products/process-orders', 'workflow', $1, $2,
         true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT (code) DO NOTHING`,
      [nextSortOrder, parent[0].id],
    );

    // No new permission: reuses PRODUCTS_VIEW like its parent (see
    // permission-registry.ts).
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM iam.permissions
       WHERE menu_id IN (SELECT id FROM iam.menus WHERE code = 'PRODUCT_PROCESS_ORDERS')`,
    );
    await queryRunner.query(
      `DELETE FROM iam.menus WHERE code = 'PRODUCT_PROCESS_ORDERS'`,
    );
  }
}
