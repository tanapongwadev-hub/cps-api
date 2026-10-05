import { MigrationInterface, QueryRunner } from 'typeorm';

// Production line hold: boxes (packets) + QR are no longer pre-created for
// the whole plan quantity when an order is placed. They are created only when
// the first workflow step reports real output ("บันทึกผลผลิต"), split into
// full boxes of the packing quantity plus one partial remainder box. What has
// not been produced yet stays on hold at the first step and can be produced
// on later days, or closed short with a reason.
//
// Additive only: existing packets and their timeline are kept untouched;
// they are tagged FULL/PARTIAL from their quantity and count as produced.
export class ProductionOrderLineHold1790600000006 implements MigrationInterface {
  name = 'ProductionOrderLineHold1790600000006';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE inventory.production_order_outputs (
        id BIGSERIAL PRIMARY KEY,
        production_order_line_id BIGINT NOT NULL
          REFERENCES inventory.production_order_lines(id) ON DELETE CASCADE,
        step_index INTEGER NOT NULL DEFAULT 0,
        quantity INTEGER NOT NULL CHECK (quantity > 0),
        box_count INTEGER NOT NULL CHECK (box_count > 0),
        work_date DATE NOT NULL,
        shift VARCHAR(20) NULL,
        remark VARCHAR(500) NULL,
        performed_by BIGINT NULL,
        performed_at TIMESTAMP NOT NULL
      )`);
    await queryRunner.query(
      `CREATE INDEX idx_production_order_outputs_line ON inventory.production_order_outputs (production_order_line_id)`,
    );

    await queryRunner.query(`
      ALTER TABLE inventory.production_order_packets
        ADD COLUMN unit_type VARCHAR(10) NOT NULL DEFAULT 'FULL'
          CHECK (unit_type IN ('FULL', 'PARTIAL')),
        ADD COLUMN production_order_output_id BIGINT NULL
          REFERENCES inventory.production_order_outputs(id) ON DELETE SET NULL`);
    await queryRunner.query(`
      UPDATE inventory.production_order_packets p
      SET unit_type = 'PARTIAL'
      FROM inventory.production_order_lines l
      WHERE l.id = p.production_order_line_id
        AND p.quantity < l.packing_quantity`);

    await queryRunner.query(`
      ALTER TABLE inventory.production_order_lines
        ADD COLUMN short_closed_quantity INTEGER NOT NULL DEFAULT 0
          CHECK (short_closed_quantity >= 0),
        ADD COLUMN short_close_reason VARCHAR(500) NULL,
        ADD COLUMN short_closed_at TIMESTAMP NULL,
        ADD COLUMN short_closed_by BIGINT NULL`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE inventory.production_order_lines
        DROP COLUMN short_closed_by,
        DROP COLUMN short_closed_at,
        DROP COLUMN short_close_reason,
        DROP COLUMN short_closed_quantity`);
    await queryRunner.query(`
      ALTER TABLE inventory.production_order_packets
        DROP COLUMN production_order_output_id,
        DROP COLUMN unit_type`);
    await queryRunner.query(`DROP TABLE inventory.production_order_outputs`);
  }
}
