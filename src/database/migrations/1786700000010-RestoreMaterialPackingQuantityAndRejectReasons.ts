import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Restores two schema objects whose original migrations no longer exist in the
 * repository, so that a clean `db:reset && migration:run` yields a database
 * that actually matches the entities.
 *
 * Both were present on databases built before those files were deleted — the
 * names are still recorded in older `iam.migrations` tables — but nothing in
 * the repo recreates them, so every fresh reset silently dropped them:
 *
 *  - master.materials.packing_quantity, originally from
 *    AddPackingQuantityToMaterial1786197666074. The Material entity maps it as
 *    `packingQuantity` and materials.service.ts reads and writes it, so without
 *    the column every material SELECT fails with 42703
 *    (column ... does not exist).
 *
 *  - master.reject_reasons, originally from one of the removed goods-receipt
 *    era migrations. The RejectReason entity and the /reject-reasons module
 *    query it, and seed.ts provisions REJECT_REASON_* permissions for it.
 *
 * Guarded with IF NOT EXISTS so this is a no-op on databases that predate the
 * deletions and already carry both objects.
 */
export class RestoreMaterialPackingQuantityAndRejectReasons1786700000010
  implements MigrationInterface
{
  name = 'RestoreMaterialPackingQuantityAndRejectReasons1786700000010';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE master.materials
      ADD COLUMN IF NOT EXISTS packing_quantity INTEGER
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS master.reject_reasons (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        code VARCHAR(50) UNIQUE NOT NULL,
        name_th VARCHAR(100) NOT NULL,
        name_en VARCHAR(100),
        description TEXT,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_by BIGINT,
        updated_by BIGINT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS master.reject_reasons`);
    await queryRunner.query(`
      ALTER TABLE master.materials DROP COLUMN IF EXISTS packing_quantity
    `);
  }
}
