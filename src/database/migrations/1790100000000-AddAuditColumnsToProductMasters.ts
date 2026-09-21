import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAuditColumnsToProductMasters1790100000000 implements MigrationInterface {
  name = 'AddAuditColumnsToProductMasters1790100000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // product_types, product_models, and customers were created in
    // 1786700000005-RebuildProductsAndAddMasters.ts before this project's
    // created_by/updated_by convention existed on simple-master tables —
    // every other simple master (categories, status_items, material_types, ...)
    // already has these. Adding them here so the new CRUD services can record
    // who created/edited a row, matching every sibling resource.
    await queryRunner.query(`
      ALTER TABLE master.product_types
        ADD COLUMN IF NOT EXISTS created_by BIGINT,
        ADD COLUMN IF NOT EXISTS updated_by BIGINT
    `);
    await queryRunner.query(`
      ALTER TABLE master.product_models
        ADD COLUMN IF NOT EXISTS created_by BIGINT,
        ADD COLUMN IF NOT EXISTS updated_by BIGINT
    `);
    await queryRunner.query(`
      ALTER TABLE master.customers
        ADD COLUMN IF NOT EXISTS created_by BIGINT,
        ADD COLUMN IF NOT EXISTS updated_by BIGINT
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE master.product_types
        DROP COLUMN IF EXISTS created_by,
        DROP COLUMN IF EXISTS updated_by
    `);
    await queryRunner.query(`
      ALTER TABLE master.product_models
        DROP COLUMN IF EXISTS created_by,
        DROP COLUMN IF EXISTS updated_by
    `);
    await queryRunner.query(`
      ALTER TABLE master.customers
        DROP COLUMN IF EXISTS created_by,
        DROP COLUMN IF EXISTS updated_by
    `);
  }
}
