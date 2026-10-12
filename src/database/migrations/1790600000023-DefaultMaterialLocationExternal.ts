import { MigrationInterface, QueryRunner } from 'typeorm';

export class DefaultMaterialLocationExternal1790600000023 implements MigrationInterface {
  name = 'DefaultMaterialLocationExternal1790600000023';

  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`ALTER TABLE master.materials ALTER COLUMN location_type SET DEFAULT 'external'`);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`ALTER TABLE master.materials ALTER COLUMN location_type SET DEFAULT 'internal'`);
  }
}
