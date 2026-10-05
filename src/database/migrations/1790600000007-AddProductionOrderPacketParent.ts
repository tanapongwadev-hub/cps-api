import { MigrationInterface, QueryRunner } from 'typeorm';

// Downstream line hold: at any workflow step, only part of a box may be
// produced. That part is split off into a new box (new QR) that moves on;
// the remainder keeps its QR and stays at the step. `parent_packet_id`
// records which box a split-off box came from (traceability). Additive only.
export class AddProductionOrderPacketParent1790600000007 implements MigrationInterface {
  name = 'AddProductionOrderPacketParent1790600000007';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE inventory.production_order_packets
        ADD COLUMN parent_packet_id BIGINT NULL
          REFERENCES inventory.production_order_packets(id) ON DELETE SET NULL`);
    await queryRunner.query(
      `CREATE INDEX idx_production_order_packets_parent ON inventory.production_order_packets (parent_packet_id)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX inventory.idx_production_order_packets_parent`,
    );
    await queryRunner.query(
      `ALTER TABLE inventory.production_order_packets DROP COLUMN parent_packet_id`,
    );
  }
}
