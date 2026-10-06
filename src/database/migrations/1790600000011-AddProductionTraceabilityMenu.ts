import { MigrationInterface, QueryRunner } from 'typeorm';

// หน้าสอบกลับการผลิต (/production/traceability) — เดิมเข้าได้เฉพาะจากลิงก์บน
// Process Board. ใช้สิทธิ์ PRODUCTION_ORDER_VIEW ของเมนูพี่น้อง ไม่สร้างสิทธิ์ใหม่
// (ดู permission-registry.ts).
export class AddProductionTraceabilityMenu1790600000011
  implements MigrationInterface
{
  name = 'AddProductionTraceabilityMenu1790600000011';

  async up(queryRunner: QueryRunner): Promise<void> {
    const parent = await queryRunner.query(
      `SELECT id FROM iam.menus WHERE code = 'PRODUCTS_LIST'`,
    );
    if (parent.length === 0) {
      throw new Error(
        'PRODUCTS_LIST menu not found — run the base seed before this migration',
      );
    }
    const rows = (await queryRunner.query(
      `SELECT COALESCE(MAX(sort_order), -1) AS max_sort
       FROM iam.menus WHERE parent_id = $1`,
      [parent[0].id],
    )) as unknown as Array<{ max_sort: number | string }>;
    const nextSortOrder = Number(rows[0]?.max_sort ?? -1) + 1;

    await queryRunner.query(
      `INSERT INTO iam.menus
        (code, name_th, name_en, menu_type, path, icon, sort_order, parent_id,
         is_visible, is_active, created_at, updated_at)
       VALUES
        ('PRODUCTION_TRACEABILITY', 'สอบกลับการผลิต', 'Production Traceability',
         'SUB', '/production/traceability', 'scan-search', $1, $2,
         true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT (code) DO NOTHING`,
      [nextSortOrder, parent[0].id],
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM iam.permissions
       WHERE menu_id IN (SELECT id FROM iam.menus WHERE code = 'PRODUCTION_TRACEABILITY')`,
    );
    await queryRunner.query(
      `DELETE FROM iam.menus WHERE code = 'PRODUCTION_TRACEABILITY'`,
    );
  }
}
