import { MigrationInterface, QueryRunner } from 'typeorm';

// Lot traceability Phase 3: one produce request may write several REJECT
// rows from the same WIP row (one per reject reason), so the idempotency key
// must include the reject reason.
export class ProductionTxIdempotencyWithReason1790600000009 implements MigrationInterface {
  name = 'ProductionTxIdempotencyWithReason1790600000009';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX inventory.uq_production_tx_idempotency`);
    await q.query(`
      CREATE UNIQUE INDEX uq_production_tx_idempotency ON inventory.production_transactions
        (request_id, transaction_type, COALESCE(source_wip_id, 0), COALESCE(source_lot_id, 0),
         COALESCE(target_lot_id, 0), COALESCE(package_id, 0), COALESCE(reject_reason_id, 0))`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX inventory.uq_production_tx_idempotency`);
    await q.query(`
      CREATE UNIQUE INDEX uq_production_tx_idempotency ON inventory.production_transactions
        (request_id, transaction_type, COALESCE(source_wip_id, 0), COALESCE(source_lot_id, 0),
         COALESCE(target_lot_id, 0), COALESCE(package_id, 0))`);
  }
}
