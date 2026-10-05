import { MigrationInterface, QueryRunner } from 'typeorm';

// Step-change history per packet — powers the workflow timeline on the
// production order page. Backfills a "created" event for every existing
// packet and, for packets already moved on, one event for their latest move
// (the only history the old columns kept).
export class CreateProductionOrderPacketEvents1790600000004 implements MigrationInterface {
  name = 'CreateProductionOrderPacketEvents1790600000004';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE inventory.production_order_packet_events (
        id BIGSERIAL PRIMARY KEY,
        production_order_packet_id BIGINT NOT NULL
          REFERENCES inventory.production_order_packets(id) ON DELETE CASCADE,
        from_step_index INTEGER NULL,
        to_step_index INTEGER NOT NULL,
        performed_by BIGINT NULL,
        performed_at TIMESTAMP NOT NULL DEFAULT now()
      )`);
    await queryRunner.query(
      `CREATE INDEX idx_production_order_packet_events_packet
       ON inventory.production_order_packet_events (production_order_packet_id, performed_at)`,
    );

    await queryRunner.query(`
      INSERT INTO inventory.production_order_packet_events
        (production_order_packet_id, from_step_index, to_step_index, performed_by, performed_at)
      SELECT p.id, NULL, 0, o.created_by, p.created_at
      FROM inventory.production_order_packets p
      JOIN inventory.production_order_lines l ON l.id = p.production_order_line_id
      JOIN inventory.production_orders o ON o.id = l.production_order_id`);
    await queryRunner.query(`
      INSERT INTO inventory.production_order_packet_events
        (production_order_packet_id, from_step_index, to_step_index, performed_by, performed_at)
      SELECT p.id, p.current_step_index - 1, p.current_step_index, p.step_updated_by, p.step_updated_at
      FROM inventory.production_order_packets p
      WHERE p.current_step_index > 0 AND p.step_updated_at IS NOT NULL`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS inventory.production_order_packet_events`,
    );
  }
}
