import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMaterialShapeAndRatioToMaterial1786700000000
  implements MigrationInterface
{
  name = 'AddMaterialShapeAndRatioToMaterial1786700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "master"."materials_material_type_enum" AS ENUM(
        'PCS', 'PIPE', 'SHEET', 'COIL'
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "master"."materials"
      ADD COLUMN "material_type" "master"."materials_material_type_enum"
      DEFAULT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_materials_material_type"
      ON "master"."materials" ("material_type")
    `);
    await queryRunner.query(`
      ALTER TABLE "master"."materials"
      ADD COLUMN "ratio" integer
      DEFAULT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "master"."materials"
      ADD CONSTRAINT "chk_materials_ratio_positive"
      CHECK ("ratio" IS NULL OR "ratio" >= 1)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "master"."materials"
      DROP CONSTRAINT "chk_materials_ratio_positive"
    `);
    await queryRunner.query(`
      ALTER TABLE "master"."materials" DROP COLUMN "ratio"
    `);
    await queryRunner.query(`DROP INDEX "master"."idx_materials_material_type"`);
    await queryRunner.query(`
      ALTER TABLE "master"."materials" DROP COLUMN "material_type"
    `);
    await queryRunner.query(`DROP TYPE "master"."materials_material_type_enum"`);
  }
}
