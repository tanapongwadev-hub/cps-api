import { MigrationInterface, QueryRunner } from 'typeorm';

// QR ต่อกล่อง: ตอนส่งต่อ ชิ้นงานของแต่ละ WIP row แบ่งเป็นกล่องละ pack_size ชิ้น
// (กล่องเต็มก่อน แล้วกล่องเศษ) กล่องไม่มีตารางของตัวเอง — คำนวณจาก qty_in + pack_size
// + origins ของ WIP row แล้วดูความคืบหน้าจากยอดที่ใช้ไป (FIFO ตามลำดับกล่อง).
export class AddPackSizeToProcessWip1790600000014 implements MigrationInterface {
  name = 'AddPackSizeToProcessWip1790600000014';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE inventory.process_wip
         ADD COLUMN pack_size int NULL CHECK (pack_size IS NULL OR pack_size > 0)`,
    );
    await queryRunner.query(
      `UPDATE inventory.process_wip w SET pack_size = l.packing_quantity
       FROM inventory.production_order_lines l
       WHERE l.id = w.production_order_line_id AND w.source_lot_id IS NOT NULL`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE inventory.process_wip DROP COLUMN pack_size`,
    );
  }
}
