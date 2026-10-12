import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMaterialProcessingOutput1790600000017 implements MigrationInterface {
  name = 'AddMaterialProcessingOutput1790600000017';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE master.materials
      ADD COLUMN processing_material_id bigint NULL
        REFERENCES master.materials(id) ON DELETE RESTRICT,
      ADD CONSTRAINT materials_processing_not_self
        CHECK (processing_material_id IS NULL OR processing_material_id <> id)`);
    await queryRunner.query(`CREATE UNIQUE INDEX materials_processing_material_unique
      ON master.materials(processing_material_id) WHERE processing_material_id IS NOT NULL`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX master.materials_processing_material_unique`);
    await queryRunner.query(`ALTER TABLE master.materials
      DROP CONSTRAINT materials_processing_not_self,
      DROP COLUMN processing_material_id`);
  }
}
