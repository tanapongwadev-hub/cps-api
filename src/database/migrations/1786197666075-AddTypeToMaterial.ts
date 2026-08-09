import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTypeToMaterial1786197666075 implements MigrationInterface {
  name = 'AddTypeToMaterial1786197666075';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "master"."materials"
      ADD COLUMN "type" varchar(20)
      DEFAULT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_materials_type" ON "master"."materials" ("type")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "master"."idx_materials_type"`);
    await queryRunner.query(`
      ALTER TABLE "master"."materials" DROP COLUMN "type"
    `);
  }
}
