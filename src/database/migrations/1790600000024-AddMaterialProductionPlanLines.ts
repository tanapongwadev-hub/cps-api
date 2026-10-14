import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMaterialProductionPlanLines1790600000024 implements MigrationInterface {
  name = 'AddMaterialProductionPlanLines1790600000024';

  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`ALTER TABLE inventory.production_plan_lines
      ALTER COLUMN product_id DROP NOT NULL,
      ALTER COLUMN bom_id DROP NOT NULL,
      ADD COLUMN material_id BIGINT REFERENCES master.materials(id) ON DELETE RESTRICT,
      ADD COLUMN material_bom_id BIGINT REFERENCES master.material_boms(id) ON DELETE RESTRICT,
      ADD CONSTRAINT chk_production_plan_line_target CHECK (
        (product_id IS NOT NULL AND bom_id IS NOT NULL AND material_id IS NULL AND material_bom_id IS NULL)
        OR (product_id IS NULL AND bom_id IS NULL AND material_id IS NOT NULL AND material_bom_id IS NOT NULL)
      )`);
    await runner.query(`CREATE INDEX idx_production_plan_lines_material ON inventory.production_plan_lines(material_id)`);
    await runner.query(`CREATE INDEX idx_production_plan_lines_material_bom ON inventory.production_plan_lines(material_bom_id)`);
  }

  async down(runner: QueryRunner): Promise<void> {
    // Refuse rollback while Material lines exist; never silently delete plans.
    await runner.query(`DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM inventory.production_plan_lines WHERE material_id IS NOT NULL) THEN
        RAISE EXCEPTION 'Cannot roll back while Material production plan lines exist';
      END IF;
    END $$`);
    await runner.query(`ALTER TABLE inventory.production_plan_lines
      DROP CONSTRAINT chk_production_plan_line_target,
      DROP COLUMN material_bom_id, DROP COLUMN material_id,
      ALTER COLUMN product_id SET NOT NULL, ALTER COLUMN bom_id SET NOT NULL`);
  }
}
