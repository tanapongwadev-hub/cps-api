import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMaterialProcessing1790600000016 implements MigrationInterface {
  name = 'CreateMaterialProcessing1790600000016';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE inventory.material_receivings
      ADD COLUMN IF NOT EXISTS source_receiving_id bigint REFERENCES inventory.material_receivings(id) ON DELETE RESTRICT,
      ADD COLUMN IF NOT EXISTS processed_quantity numeric(18,4) NOT NULL DEFAULT 0 CHECK (processed_quantity >= 0)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_receiving_source ON inventory.material_receivings(source_receiving_id)`);
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS inventory.material_processings (
      id bigserial PRIMARY KEY, request_key uuid NOT NULL UNIQUE, code varchar(40) NOT NULL UNIQUE,
      source_receiving_id bigint NOT NULL REFERENCES inventory.material_receivings(id) ON DELETE RESTRICT,
      output_receiving_id bigint NOT NULL UNIQUE REFERENCES inventory.material_receivings(id) ON DELETE RESTRICT,
      source_material_id bigint NOT NULL REFERENCES master.materials(id) ON DELETE RESTRICT,
      target_material_id bigint NOT NULL REFERENCES master.materials(id) ON DELETE RESTRICT,
      source_quantity numeric(18,4) NOT NULL CHECK (source_quantity > 0),
      pieces_per_unit integer NOT NULL CHECK (pieces_per_unit > 0),
      scrap_quantity integer NOT NULL DEFAULT 0 CHECK (scrap_quantity >= 0),
      output_quantity numeric(18,4) NOT NULL CHECK (output_quantity > 0),
      packing_quantity integer NOT NULL CHECK (packing_quantity > 0), source_packages jsonb NOT NULL,
      remark text, created_by bigint NOT NULL, created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CHECK (source_material_id <> target_material_id),
      CHECK (output_quantity = source_quantity * pieces_per_unit - scrap_quantity)
    )`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_processing_source ON inventory.material_processings(source_receiving_id)`);
    await queryRunner.query(`INSERT INTO iam.menus
      (code,name_th,name_en,menu_type,path,icon,sort_order,parent_id,is_visible,is_active,created_at,updated_at)
      VALUES ('MATERIAL_PROCESSING','แปรรูปวัตถุดิบ','Material Processing','MAIN','/material-processing','scissors',
        (SELECT COALESCE(MAX(sort_order),0)+1 FROM iam.menus WHERE parent_id IS NULL),NULL,true,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
      ON CONFLICT (code) DO NOTHING`);
    for (const [action, permission] of [['READ', 'MATERIAL_PROCESSING_VIEW'], ['CREATE', 'MATERIAL_PROCESSING_CREATE']]) {
      await queryRunner.query(`INSERT INTO iam.permissions (menu_id,action_id,code,description,is_active,created_at,updated_at)
        SELECT m.id,a.id,$2,'แปรรูปวัตถุดิบ — ' || $1,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
        FROM iam.menus m CROSS JOIN iam.actions a WHERE m.code='MATERIAL_PROCESSING' AND a.code=$1
        ON CONFLICT (code) DO NOTHING`, [action, permission]);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // This rollback is only safe before manufacturing records have been used.
    const rows: { total: string }[] = await queryRunner.query('SELECT COUNT(*)::text AS total FROM inventory.material_processings');
    if (Number(rows[0].total)) throw new Error('Cannot remove material processing while manufacturing history exists');
    await queryRunner.query(`DELETE FROM iam.permissions WHERE code IN ('MATERIAL_PROCESSING_VIEW','MATERIAL_PROCESSING_CREATE')`);
    await queryRunner.query(`DELETE FROM iam.menus WHERE code='MATERIAL_PROCESSING'`);
    await queryRunner.query('DROP TABLE inventory.material_processings');
    await queryRunner.query('ALTER TABLE inventory.material_receivings DROP COLUMN processed_quantity, DROP COLUMN source_receiving_id');
  }
}
