import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMaterialLocationType1790600000022 implements MigrationInterface {
  name = 'AddMaterialLocationType1790600000022';

  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`ALTER TABLE master.materials
      ADD COLUMN location_type varchar(20) NOT NULL DEFAULT 'internal',
      ADD CONSTRAINT chk_materials_location_type CHECK (location_type IN ('internal', 'external'))`);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`ALTER TABLE master.materials
      DROP CONSTRAINT chk_materials_location_type,
      DROP COLUMN location_type`);
  }
}
