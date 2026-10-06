import { MigrationInterface, QueryRunner } from 'typeorm';

// กล่องที่ถูกใช้ในแต่ละรายการบันทึก: ledger row ที่ใช้งานจาก WIP row ที่ส่งต่อมา
// (ผลิต/ของเสีย/ปิดยอด และ REVERSAL ของมัน) บอกว่าชิ้นงานมาจากกล่องไหนกี่ชิ้น
// ตารางเป็น append-only เหมือน ledger (ห้าม UPDATE/DELETE) — ยอดที่ทำแล้วของกล่อง
// คือ SUM(qty) ต่อ (wip_id, box_no) และ reversal ลบกลับด้วยแถวติดลบ
export class CreateProductionTransactionBoxes1790600000015
  implements MigrationInterface
{
  name = 'CreateProductionTransactionBoxes1790600000015';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE inventory.production_transaction_boxes (
        transaction_id bigint NOT NULL REFERENCES inventory.production_transactions(id),
        wip_id bigint NOT NULL REFERENCES inventory.process_wip(id),
        box_no int NOT NULL CHECK (box_no > 0),
        qty int NOT NULL CHECK (qty <> 0),
        PRIMARY KEY (transaction_id, box_no)
      )`);
    await q.query(
      `CREATE INDEX idx_ptx_boxes_wip ON inventory.production_transaction_boxes (wip_id, box_no)`,
    );
    for (const op of ['DELETE', 'UPDATE']) {
      await q.query(`
        CREATE TRIGGER trg_production_transaction_boxes_no_${op.toLowerCase()}
        BEFORE ${op} ON inventory.production_transaction_boxes
        FOR EACH ROW EXECUTE FUNCTION inventory.production_trace_forbid_change()`);
    }
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(
      `DROP TABLE IF EXISTS inventory.production_transaction_boxes`,
    );
  }
}
