import { MigrationInterface, QueryRunner } from 'typeorm';

export class GroupProcessOrderMenus1790600000028 implements MigrationInterface {
  name = 'GroupProcessOrderMenus1790600000028';

  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM iam.menus WHERE code='PRODUCT_PROCESS_ORDERS') THEN
        RAISE EXCEPTION 'Product process orders menu must exist before grouping';
      END IF;
    END $$`);
    await runner.query(`INSERT INTO iam.menus(code,name_th,name_en,menu_type,path,icon,sort_order,parent_id,is_visible,is_active,created_at,updated_at)
      SELECT 'PROCESS_PRODUCTION','การสั่งผลิตตามกระบวนการ','Process Production','MAIN',NULL,'workflow',
        COALESCE(MAX(sort_order),0)+1,NULL,true,true,now(),now()
      FROM iam.menus WHERE parent_id IS NULL
      ON CONFLICT(code) DO UPDATE SET name_th=EXCLUDED.name_th,menu_type='MAIN',path=NULL,parent_id=NULL,updated_at=now()`);
    // Keep the existing Product menu ID, path and permission mappings.
    await runner.query(`UPDATE iam.menus SET name_th='การสั่งผลิตตามกระบวนการสินค้า',name_en='Product Process Production',
      menu_type='SUB',parent_id=(SELECT id FROM iam.menus WHERE code='PROCESS_PRODUCTION'),sort_order=1,updated_at=now()
      WHERE code='PRODUCT_PROCESS_ORDERS'`);
    await runner.query(`INSERT INTO iam.menus(code,name_th,name_en,menu_type,path,icon,sort_order,parent_id,is_visible,is_active,created_at,updated_at)
      SELECT 'MATERIAL_PROCESS_ORDERS','การสั่งผลิตตามกระบวนการวัตถุดิบภายใน','Internal Material Process Production',
        'SUB','/materials/process-orders','workflow',2,id,true,true,now(),now()
      FROM iam.menus WHERE code='PROCESS_PRODUCTION'
      ON CONFLICT(code) DO UPDATE SET name_th=EXCLUDED.name_th,path=EXCLUDED.path,parent_id=EXCLUDED.parent_id,updated_at=now()`);
    await runner.query(`INSERT INTO iam.permissions(menu_id,action_id,code,description,is_active,created_at,updated_at)
      SELECT m.id,p.action_id,'MATERIAL_PROCESS_ORDER_VIEW','แสดงเมนูการสั่งผลิตตามกระบวนการวัตถุดิบภายใน',true,now(),now()
      FROM iam.menus m CROSS JOIN iam.permissions p
      WHERE m.code='MATERIAL_PROCESS_ORDERS' AND p.code='PRODUCTION_ORDER_VIEW'
      ON CONFLICT(code) DO NOTHING`);
    await runner.query(`INSERT INTO iam.department_permissions(permission_id,department_id,is_active,created_at,updated_at)
      SELECT target.id,dp.department_id,dp.is_active,now(),now()
      FROM iam.department_permissions dp JOIN iam.permissions source ON source.id=dp.permission_id
      CROSS JOIN iam.permissions target WHERE source.code='PRODUCTION_ORDER_VIEW' AND target.code='MATERIAL_PROCESS_ORDER_VIEW'
      ON CONFLICT DO NOTHING`);
    await runner.query(`INSERT INTO iam.user_department_permissions(user_department_role_id,permission_id,is_active,effect,granted_at,granted_by,expires_at,created_by,updated_by,created_at,updated_at)
      SELECT udp.user_department_role_id,target.id,udp.is_active,udp.effect,udp.granted_at,udp.granted_by,udp.expires_at,udp.created_by,udp.updated_by,now(),now()
      FROM iam.user_department_permissions udp JOIN iam.permissions source ON source.id=udp.permission_id
      CROSS JOIN iam.permissions target WHERE source.code='PRODUCTION_ORDER_VIEW' AND target.code='MATERIAL_PROCESS_ORDER_VIEW'
      ON CONFLICT DO NOTHING`);
  }

  async down(): Promise<void> {
    throw new Error('Use a forward migration to preserve menu customizations and permission mappings');
  }
}
