import { MigrationInterface, QueryRunner } from 'typeorm';

export class GroupProductionPlanMenus1790600000026 implements MigrationInterface {
  name = 'GroupProductionPlanMenus1790600000026';

  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM iam.menus WHERE code='PRODUCTION_PLANS')
        OR NOT EXISTS (SELECT 1 FROM iam.menus WHERE code='MATERIAL_PRODUCTION_PLANS') THEN
        RAISE EXCEPTION 'Production plan child menus must exist before grouping';
      END IF;
    END $$`);
    await runner.query(`INSERT INTO iam.menus(code,name_th,name_en,menu_type,path,icon,sort_order,parent_id,is_visible,is_active,created_at,updated_at)
      SELECT 'PRODUCTION_PLANNING','แผนผลิต','Production Planning','MAIN',NULL,'clipboard-list',sort_order,NULL,true,true,now(),now()
      FROM iam.menus WHERE code='PRODUCTION_PLANS'
      ON CONFLICT(code) DO UPDATE SET name_th=EXCLUDED.name_th,name_en=EXCLUDED.name_en,
        menu_type='MAIN',path=NULL,parent_id=NULL,is_visible=true,is_active=true,updated_at=now()`);
    for (const [code, label, order] of [
      ['PRODUCTION_PLANS', 'แผนผลิตสินค้า', 1],
      ['MATERIAL_PRODUCTION_PLANS', 'แผนผลิตวัตถุดิบภายใน', 2],
    ] as const) {
      // Retain child IDs, paths and permission mappings; ancestor inclusion exposes MAIN.
      await runner.query(`UPDATE iam.menus SET name_th=$2,menu_type='SUB',sort_order=$3,
        parent_id=(SELECT id FROM iam.menus WHERE code='PRODUCTION_PLANNING'),updated_at=now()
        WHERE code=$1`, [code, label, order]);
    }
  }

  async down(): Promise<void> {
    throw new Error('Use a forward migration to preserve menu customizations and permissions');
  }
}
