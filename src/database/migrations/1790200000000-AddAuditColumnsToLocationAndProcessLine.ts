import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAuditColumnsToLocationAndProcessLine1790200000000
  implements MigrationInterface
{
  name = 'AddAuditColumnsToLocationAndProcessLine1790200000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // master.locations and master.process_lines were created in
    // 1786700000005-RebuildProductsAndAddMasters.ts (as plain lookup tables
    // for Product.locationId/processLineId) before this project's
    // created_by/updated_by convention existed on simple-master tables —
    // every other simple master already has these. Adding them here so the
    // new CRUD services (see AddLocationAndProcessLineMenusAndPermissions)
    // can record who created/edited a row, matching every sibling resource.
    // Same shape as 1790100000000-AddAuditColumnsToProductMasters.ts, which
    // did the identical fix for product_types/product_models/customers —
    // three siblings created in the same original migration.
    await queryRunner.query(`
      ALTER TABLE master.locations
        ADD COLUMN IF NOT EXISTS created_by BIGINT,
        ADD COLUMN IF NOT EXISTS updated_by BIGINT
    `);
    await queryRunner.query(`
      ALTER TABLE master.process_lines
        ADD COLUMN IF NOT EXISTS created_by BIGINT,
        ADD COLUMN IF NOT EXISTS updated_by BIGINT
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE master.locations
        DROP COLUMN IF EXISTS created_by,
        DROP COLUMN IF EXISTS updated_by
    `);
    await queryRunner.query(`
      ALTER TABLE master.process_lines
        DROP COLUMN IF EXISTS created_by,
        DROP COLUMN IF EXISTS updated_by
    `);
  }
}
