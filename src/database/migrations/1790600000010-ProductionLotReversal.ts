import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lot traceability Phase 9 — reversal (V10) without deleting anything.
 *
 * - A lot whose every piece was reversed keeps its row at produced 0 with
 *   status REVERSED (instead of the old "produced > 0" rule).
 * - Lot origin rows may drop to 0 for the same reason (they cannot be
 *   deleted — DB trigger).
 * - Lineage edges are append-only, so a reversal appends a negative edge;
 *   readers use SUM(qty) per pair and hide pairs that net to 0.
 */
export class ProductionLotReversal1790600000010 implements MigrationInterface {
  name = 'ProductionLotReversal1790600000010';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE inventory.production_lots
        DROP CONSTRAINT production_lots_produced_qty_check,
        ADD CONSTRAINT production_lots_produced_qty_check
          CHECK (produced_qty > 0 OR (produced_qty = 0 AND status = 'REVERSED'))`);
    await q.query(`
      ALTER TABLE inventory.production_lot_origins
        DROP CONSTRAINT production_lot_origins_qty_check,
        ADD CONSTRAINT production_lot_origins_qty_check CHECK (qty >= 0)`);
    await q.query(`
      ALTER TABLE inventory.production_lot_sources
        DROP CONSTRAINT production_lot_sources_qty_check,
        ADD CONSTRAINT production_lot_sources_qty_check CHECK (qty <> 0)`);
  }

  async down(q: QueryRunner): Promise<void> {
    // Only reversible while no reversal has been recorded.
    await q.query(`
      ALTER TABLE inventory.production_lot_sources
        DROP CONSTRAINT production_lot_sources_qty_check,
        ADD CONSTRAINT production_lot_sources_qty_check CHECK (qty > 0)`);
    await q.query(`
      ALTER TABLE inventory.production_lot_origins
        DROP CONSTRAINT production_lot_origins_qty_check,
        ADD CONSTRAINT production_lot_origins_qty_check CHECK (qty > 0)`);
    await q.query(`
      ALTER TABLE inventory.production_lots
        DROP CONSTRAINT production_lots_produced_qty_check,
        ADD CONSTRAINT production_lots_produced_qty_check CHECK (produced_qty > 0)`);
  }
}
