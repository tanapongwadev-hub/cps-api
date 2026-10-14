import { MigrationInterface, QueryRunner } from 'typeorm';

export class SplitMaterialJobOrderMenus1790600000027 implements MigrationInterface {
  name = 'SplitMaterialJobOrderMenus1790600000027';

  async up(runner: QueryRunner): Promise<void> {
    for (const [code, name, path, order] of [
      ['PRODUCT_JOB_ORDERS', 'ใบจัดงานสินค้า', '/materials/job-orders/products', 1],
      ['INTERNAL_MATERIAL_JOB_ORDERS', 'ใบจัดงานวัตถุดิบภายใน', '/materials/job-orders/internal-materials', 2],
    ]) {
      await runner.query(`INSERT INTO iam.menus(code,name_th,name_en,menu_type,path,icon,sort_order,parent_id,is_visible,is_active,created_at,updated_at)
        SELECT $1,$2,$2,'SUB',$3,'clipboard-list',$4,id,true,true,now(),now()
        FROM iam.menus WHERE code='MATERIAL_JOB_ORDERS'
        ON CONFLICT(code) DO UPDATE SET name_th=EXCLUDED.name_th,path=EXCLUDED.path,parent_id=EXCLUDED.parent_id,updated_at=now()`,
        [code, name, path, order]);
    }
    // Preserve existing permission IDs and grants when turning the old menu into a container.
    await runner.query(`UPDATE iam.permissions SET menu_id=(SELECT id FROM iam.menus WHERE code='PRODUCT_JOB_ORDERS'),updated_at=now()
      WHERE menu_id=(SELECT id FROM iam.menus WHERE code='MATERIAL_JOB_ORDERS')`);
    await runner.query(`UPDATE iam.menus SET path=NULL,updated_at=now() WHERE code='MATERIAL_JOB_ORDERS'`);
    // Navigation permission; print/pick/issue continue using MATERIAL_JOB_ORDER_*.
    await runner.query(`INSERT INTO iam.permissions(menu_id,action_id,code,description,is_active,created_at,updated_at)
      SELECT m.id,p.action_id,'INTERNAL_MATERIAL_JOB_ORDER_VIEW','แสดงเมนูใบจัดงานวัตถุดิบภายใน',true,now(),now()
      FROM iam.menus m CROSS JOIN iam.permissions p
      WHERE m.code='INTERNAL_MATERIAL_JOB_ORDERS' AND p.code='MATERIAL_JOB_ORDER_VIEW'
      ON CONFLICT(code) DO NOTHING`);
    await runner.query(`INSERT INTO iam.department_permissions(permission_id,department_id,is_active,created_at,updated_at)
      SELECT target.id,dp.department_id,dp.is_active,now(),now()
      FROM iam.department_permissions dp JOIN iam.permissions source ON source.id=dp.permission_id
      CROSS JOIN iam.permissions target WHERE source.code='MATERIAL_JOB_ORDER_VIEW' AND target.code='INTERNAL_MATERIAL_JOB_ORDER_VIEW'
      ON CONFLICT DO NOTHING`);
    await runner.query(`INSERT INTO iam.user_department_permissions(user_department_role_id,permission_id,is_active,effect,granted_at,granted_by,expires_at,created_by,updated_by,created_at,updated_at)
      SELECT udp.user_department_role_id,target.id,udp.is_active,udp.effect,udp.granted_at,udp.granted_by,udp.expires_at,udp.created_by,udp.updated_by,now(),now()
      FROM iam.user_department_permissions udp JOIN iam.permissions source ON source.id=udp.permission_id
      CROSS JOIN iam.permissions target WHERE source.code='MATERIAL_JOB_ORDER_VIEW' AND target.code='INTERNAL_MATERIAL_JOB_ORDER_VIEW'
      ON CONFLICT DO NOTHING`);
  }

  async down(): Promise<void> {
    throw new Error('Use a forward migration to preserve configured menu and permission mappings');
  }
}
