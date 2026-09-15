import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMaterialTypeIdToMaterials1786700000012 implements MigrationInterface {
  name = 'AddMaterialTypeIdToMaterials1786700000012';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Link materials to the master.material_types catalog (see
    // 1786700000011-CreateMaterialTypesMaster.ts). Nullable and independent
    // of the legacy free-text `materials.type` column, which stays as the
    // page-scope discriminator (the Materials PC page filters on type = 'PC').
    await queryRunner.query(`
      ALTER TABLE "master"."materials"
      ADD COLUMN "material_type_id" BIGINT
    `);
    await queryRunner.query(`
      ALTER TABLE "master"."materials"
      ADD CONSTRAINT "fk_materials_material_type"
      FOREIGN KEY ("material_type_id") REFERENCES "master"."material_types"("id") ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_materials_material_type_id"
      ON "master"."materials" ("material_type_id")
    `);
    // Backfill from the existing `type` code where it matches a seeded row.
    await queryRunner.query(`
      UPDATE "master"."materials" m
      SET "material_type_id" = mt."id"
      FROM "master"."material_types" mt
      WHERE m."material_type_id" IS NULL AND m."type" IS NOT NULL AND mt."code" = m."type"
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "master"."idx_materials_material_type_id"`,
    );
    await queryRunner.query(`
      ALTER TABLE "master"."materials"
      DROP CONSTRAINT IF EXISTS "fk_materials_material_type"
    `);
    await queryRunner.query(`
      ALTER TABLE "master"."materials" DROP COLUMN "material_type_id"
    `);
  }
}
