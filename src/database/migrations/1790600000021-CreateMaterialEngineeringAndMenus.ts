import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMaterialEngineeringAndMenus1790600000021 implements MigrationInterface {
  name = 'CreateMaterialEngineeringAndMenus1790600000021';

  async up(runner: QueryRunner): Promise<void> {
    // Match the existing Menu entity/DTO enum; legacy databases only allowed MAIN/SUB.
    await runner.query(`ALTER TABLE iam.menus DROP CONSTRAINT menus_menu_type_check,
      ADD CONSTRAINT menus_menu_type_check CHECK(menu_type IN ('MAIN','SUB','BUTTON'))`);
    for (const table of ['material_boms', 'material_workflows']) {
      await runner.query(`CREATE TABLE master.${table} (
        id BIGSERIAL PRIMARY KEY, material_id BIGINT NOT NULL REFERENCES master.materials(id) ON DELETE RESTRICT,
        version VARCHAR(20) NOT NULL, status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','ACTIVE','INACTIVE')),
        remark TEXT, created_by BIGINT NOT NULL REFERENCES iam.users(id), updated_by BIGINT NOT NULL REFERENCES iam.users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(material_id,version)
        ${table === 'material_boms' ? ', specification TEXT' : ''}
      )`);
      await runner.query(`CREATE UNIQUE INDEX uq_${table}_active ON master.${table}(material_id) WHERE status='ACTIVE'`);
    }
    await runner.query(`CREATE TABLE master.material_bom_items (
      id BIGSERIAL PRIMARY KEY,bom_id BIGINT NOT NULL REFERENCES master.material_boms(id) ON DELETE CASCADE,
      material_id BIGINT NOT NULL REFERENCES master.materials(id) ON DELETE RESTRICT,
      sort_order INTEGER NOT NULL CHECK(sort_order>=0), quantity NUMERIC(18,4) NOT NULL CHECK(quantity>0),
      unit_id BIGINT NOT NULL REFERENCES master.units(id),is_scrap BOOLEAN NOT NULL DEFAULT false,
      wastage_percent NUMERIC(7,4) CHECK(wastage_percent BETWEEN 0 AND 100),remark TEXT,
      UNIQUE(bom_id,material_id),UNIQUE(bom_id,sort_order)
    )`);
    await runner.query(`CREATE TABLE master.material_workflow_steps (
      id BIGSERIAL PRIMARY KEY,workflow_id BIGINT NOT NULL REFERENCES master.material_workflows(id) ON DELETE CASCADE,
      sort_order INTEGER NOT NULL CHECK(sort_order>=0),process_step_id BIGINT NOT NULL REFERENCES master.process_steps(id),
      description TEXT,UNIQUE(workflow_id,sort_order)
    )`);
    await runner.query(`INSERT INTO iam.menus(code,name_th,name_en,menu_type,path,icon,sort_order,is_visible,is_active,created_at,updated_at)
      VALUES('BOM_WORKFLOW','BOM & Workflow','BOM & Workflow','MAIN','/bom-workflow','git-branch',
      (SELECT COALESCE(MAX(sort_order),0)+1 FROM iam.menus WHERE parent_id IS NULL),true,true,now(),now()) ON CONFLICT(code) DO NOTHING`);
    for (const [code, label, path, order] of [
      ['MATERIAL_ENGINEERING','BOM & Workflow Materials','/bom-workflow/materials',1],
      ['BOMS','BOM & Workflow Products','/bom-workflow/products',2],
    ] as const) {
      await runner.query(`INSERT INTO iam.menus(code,name_th,name_en,menu_type,path,icon,sort_order,parent_id,is_visible,is_active,created_at,updated_at)
        SELECT $1,$2,$2,'SUB',$3,'git-branch',$4,id,true,true,now(),now() FROM iam.menus WHERE code='BOM_WORKFLOW'
        ON CONFLICT(code) DO UPDATE SET name_th=EXCLUDED.name_th,name_en=EXCLUDED.name_en,menu_type='SUB',path=EXCLUDED.path,
        parent_id=EXCLUDED.parent_id,sort_order=EXCLUDED.sort_order,updated_at=now()`, [code,label,path,order]);
    }
    for (const [code, parent] of [['MATERIAL_WORKFLOW_ACTIONS','MATERIAL_ENGINEERING'],['PRODUCT_WORKFLOW_ACTIONS','BOMS']]) {
      await runner.query(`INSERT INTO iam.menus(code,name_th,name_en,menu_type,path,sort_order,parent_id,is_visible,is_active,created_at,updated_at)
        SELECT $1,'Workflow','Workflow','BUTTON',NULL,1,id,true,true,now(),now() FROM iam.menus WHERE code=$2
        ON CONFLICT(code) DO NOTHING`, [code,parent]);
    }
    for (const prefix of ['MATERIAL_BOMS','MATERIAL_WORKFLOWS','PRODUCT_WORKFLOWS']) {
      for (const [action,suffix] of [['READ','VIEW'],['CREATE','CREATE'],['UPDATE','UPDATE']]) {
        await runner.query(`INSERT INTO iam.permissions(menu_id,action_id,code,description,is_active,created_at,updated_at)
          SELECT m.id,a.id,$3::varchar(100),$3::text,true,now(),now() FROM iam.menus m CROSS JOIN iam.actions a
          WHERE m.code=$1 AND a.code=$2 ON CONFLICT(code) DO UPDATE SET menu_id=EXCLUDED.menu_id,updated_at=now()`,
        [prefix === 'PRODUCT_WORKFLOWS' ? 'PRODUCT_WORKFLOW_ACTIONS' : prefix === 'MATERIAL_WORKFLOWS' ? 'MATERIAL_WORKFLOW_ACTIONS' : 'MATERIAL_ENGINEERING', action, `${prefix}_${suffix}`]);
      }
    }
  }

  async down(): Promise<void> {
    throw new Error('Rollback requires preserving engineering versions and original IAM menu/permission mappings; use a forward migration');
  }
}
