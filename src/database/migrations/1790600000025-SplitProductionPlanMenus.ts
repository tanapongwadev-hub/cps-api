import { MigrationInterface, QueryRunner } from 'typeorm';

export class SplitProductionPlanMenus1790600000025 implements MigrationInterface {
  name = 'SplitProductionPlanMenus1790600000025';

  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`UPDATE iam.menus SET name_th='แผนผลิตสินค้า', name_en='Product Production Plans', updated_at=now() WHERE code='PRODUCTION_PLANS'`);
    await runner.query(`INSERT INTO iam.menus(code,name_th,name_en,menu_type,path,icon,sort_order,parent_id,is_visible,is_active,created_at,updated_at)
      SELECT 'MATERIAL_PRODUCTION_PLANS','แผนผลิตวัสดุภายใน','Internal Material Production Plans',menu_type,
        '/production/material-plans','package',sort_order+1,parent_id,true,true,now(),now()
      FROM iam.menus WHERE code='PRODUCTION_PLANS'
      ON CONFLICT(code) DO UPDATE SET name_th=EXCLUDED.name_th,name_en=EXCLUDED.name_en,path=EXCLUDED.path,updated_at=now()`);
    // Navigation permission only; lifecycle endpoints retain PRODUCTION_PLAN_* guards.
    await runner.query(`INSERT INTO iam.permissions(menu_id,action_id,code,description,is_active,created_at,updated_at)
      SELECT m.id,p.action_id,'MATERIAL_PRODUCTION_PLAN_VIEW','แสดงเมนูแผนผลิตวัสดุภายใน',true,now(),now()
      FROM iam.menus m CROSS JOIN iam.permissions p
      WHERE m.code='MATERIAL_PRODUCTION_PLANS' AND p.code='PRODUCTION_PLAN_VIEW'
      ON CONFLICT(code) DO NOTHING`);
    await runner.query(`INSERT INTO iam.department_permissions(permission_id,department_id,is_active,created_at,updated_at)
      SELECT target.id,dp.department_id,dp.is_active,now(),now()
      FROM iam.department_permissions dp JOIN iam.permissions source ON source.id=dp.permission_id
      CROSS JOIN iam.permissions target WHERE source.code='PRODUCTION_PLAN_VIEW' AND target.code='MATERIAL_PRODUCTION_PLAN_VIEW'
      ON CONFLICT DO NOTHING`);
    await runner.query(`INSERT INTO iam.user_department_permissions(user_department_role_id,permission_id,is_active,effect,granted_at,granted_by,expires_at,created_by,updated_by,created_at,updated_at)
      SELECT udp.user_department_role_id,target.id,udp.is_active,udp.effect,udp.granted_at,udp.granted_by,udp.expires_at,udp.created_by,udp.updated_by,now(),now()
      FROM iam.user_department_permissions udp JOIN iam.permissions source ON source.id=udp.permission_id
      CROSS JOIN iam.permissions target WHERE source.code='PRODUCTION_PLAN_VIEW' AND target.code='MATERIAL_PRODUCTION_PLAN_VIEW'
      ON CONFLICT DO NOTHING`);
  }

  async down(): Promise<void> {
    throw new Error('Use a forward migration to preserve configured menu and permission mappings');
  }
}
