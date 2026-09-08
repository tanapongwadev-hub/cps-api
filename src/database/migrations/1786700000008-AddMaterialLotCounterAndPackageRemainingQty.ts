import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * material_receiving_packages gains remaining_quantity so a package/box can
 * track partial consumption (IN_STOCK / PARTIAL / ISSUED) — defaults to the
 * package's own quantity at receive time. Nothing currently decrements it
 * (materials-disbursement's FIFO consumption is untouched, out of scope for
 * this change) — this is schema readiness only. See AGENTS.md § Material
 * Receiving.
 *
 * (Kept this migration's original file name/timestamp even though an
 * earlier revision of it also introduced a per-material lot counter table —
 * that part was reverted per a follow-up request to keep the Internal Lot
 * generator on the existing global-per-day `material_receiving_lot_counters`
 * table with the "CCI" prefix retained, not a per-material one. Nothing else
 * in this migration changed.)
 */
export class AddMaterialLotCounterAndPackageRemainingQty1786700000008 implements MigrationInterface {
  name = 'AddMaterialLotCounterAndPackageRemainingQty1786700000008';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE inventory.material_receiving_packages
      ADD COLUMN remaining_quantity NUMERIC(18, 4)
    `);
    await queryRunner.query(`
      UPDATE inventory.material_receiving_packages
      SET remaining_quantity = quantity
      WHERE remaining_quantity IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE inventory.material_receiving_packages
      ALTER COLUMN remaining_quantity SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE inventory.material_receiving_packages
      ADD CONSTRAINT chk_material_receiving_packages_remaining_qty
        CHECK (remaining_quantity >= 0 AND remaining_quantity <= quantity)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE inventory.material_receiving_packages
      DROP CONSTRAINT IF EXISTS chk_material_receiving_packages_remaining_qty
    `);
    await queryRunner.query(`
      ALTER TABLE inventory.material_receiving_packages
      DROP COLUMN IF EXISTS remaining_quantity
    `);
  }
}
