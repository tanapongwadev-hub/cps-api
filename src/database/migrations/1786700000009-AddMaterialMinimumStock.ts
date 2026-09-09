import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMaterialMinimumStock1786700000009 implements MigrationInterface {
  name = 'AddMaterialMinimumStock1786700000009';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE master.materials
      ADD COLUMN minimum_stock NUMERIC(18, 4) NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      ALTER TABLE master.materials
      ADD CONSTRAINT chk_materials_minimum_stock CHECK (minimum_stock >= 0)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE master.materials
      DROP CONSTRAINT IF EXISTS chk_materials_minimum_stock
    `);
    await queryRunner.query(`
      ALTER TABLE master.materials DROP COLUMN IF EXISTS minimum_stock
    `);
  }
}
