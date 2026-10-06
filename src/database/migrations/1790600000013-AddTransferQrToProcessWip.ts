import { MigrationInterface, QueryRunner } from 'typeorm';

// QR ตอนส่งต่อ: ทุกครั้งที่ส่งงานไปขั้นตอนถัดไป แต่ละ WIP row ที่เกิดที่ขั้นปลายทาง
// (หนึ่งแถวต่อ Lot ต้นทางต่อการส่ง) ได้ QR ของตัวเอง `TQ-{lotต้นทาง}-S{ขั้นปลายทาง}-{nn}`
// เพื่อสแกนดูว่างานชุดนั้นอยู่ขั้นตอนไหน. แถวที่มีอยู่แล้วถูก backfill.
export class AddTransferQrToProcessWip1790600000013
  implements MigrationInterface
{
  name = 'AddTransferQrToProcessWip1790600000013';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE inventory.process_wip ADD COLUMN qr_code varchar(80) NULL`,
    );
    await queryRunner.query(`
      UPDATE inventory.process_wip w
      SET qr_code = 'TQ-' || l.lot_no || '-S' || (w.step_index + 1) || '-'
                    || lpad(x.rn::text, 2, '0')
      FROM (
        SELECT id, row_number() OVER (
                 PARTITION BY source_lot_id, step_index ORDER BY id) AS rn
        FROM inventory.process_wip WHERE source_lot_id IS NOT NULL
      ) x
      JOIN inventory.process_wip w2 ON w2.id = x.id
      JOIN inventory.production_lots l ON l.id = w2.source_lot_id
      WHERE w.id = x.id`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX uq_process_wip_qr_code
         ON inventory.process_wip (qr_code) WHERE qr_code IS NOT NULL`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS inventory.uq_process_wip_qr_code`);
    await queryRunner.query(
      `ALTER TABLE inventory.process_wip DROP COLUMN qr_code`,
    );
  }
}
