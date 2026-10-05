import { MigrationInterface, QueryRunner } from 'typeorm';

// 1) Timeline clock fix. The app writes JS Dates into `timestamp` columns as
//    UTC wall-clock, but DB defaults (`now()` in the Asia/Bangkok session)
//    store Bangkok wall-clock. The "created" events backfilled from
//    production_order_packets.created_at (a DB default) were therefore 7h
//    ahead of the UTC-written step events, so a step could show "finished"
//    before it "started". Convert those rows to the same UTC wall-clock, and
//    drop the column default so new rows are always written by the app.
// 2) ANALYZE the production-order tables: they were never analyzed, so the
//    planner assumed ~2 rows and chose sequential scans.
export class FixPacketEventTimesAndAnalyze1790600000005 implements MigrationInterface {
  name = 'FixPacketEventTimesAndAnalyze1790600000005';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE inventory.production_order_packet_events e
      SET performed_at = (e.performed_at AT TIME ZONE 'Asia/Bangkok') AT TIME ZONE 'UTC'
      FROM inventory.production_order_packets p
      WHERE p.id = e.production_order_packet_id
        AND e.from_step_index IS NULL
        AND e.performed_at = p.created_at`);
    await queryRunner.query(
      `ALTER TABLE inventory.production_order_packet_events ALTER COLUMN performed_at DROP DEFAULT`,
    );
    for (const table of [
      'production_orders',
      'production_order_lines',
      'production_order_packets',
      'production_order_packet_events',
    ]) {
      await queryRunner.query(`ANALYZE inventory.${table}`);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE inventory.production_order_packet_events ALTER COLUMN performed_at SET DEFAULT now()`,
    );
    await queryRunner.query(`
      UPDATE inventory.production_order_packet_events e
      SET performed_at = (e.performed_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Bangkok'
      FROM inventory.production_order_packets p
      WHERE p.id = e.production_order_packet_id
        AND e.from_step_index IS NULL
        AND (e.performed_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Bangkok' = p.created_at`);
  }
}
