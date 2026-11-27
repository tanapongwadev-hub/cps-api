import { MigrationInterface, QueryRunner } from 'typeorm';

// รายการออเดอร์ขายเก็บข้อมูลจาก "ใบแจ้งยอดส่งสินค้า" ของลูกค้าต่อแถว:
// เลข PO, เวลาส่ง (TIME), จุดส่ง (Home) และไลน์ของลูกค้า (LINE)
// สินค้าเดียวกันจึงอยู่หลายแถวในออเดอร์เดียวได้ (คนละ PO/รอบส่ง)
export class AddSalesOrderLineDeliveryFields1790600000065 implements MigrationInterface {
  name = 'AddSalesOrderLineDeliveryFields1790600000065';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE inventory.sales_order_lines
         ADD COLUMN IF NOT EXISTS customer_po varchar(100),
         ADD COLUMN IF NOT EXISTS delivery_time varchar(20),
         ADD COLUMN IF NOT EXISTS delivery_point varchar(50),
         ADD COLUMN IF NOT EXISTS customer_line varchar(50)`,
    );
    // The same product may now appear on several lines (different PO / round).
    await queryRunner.query(
      `DO $$
       DECLARE c record;
       BEGIN
         FOR c IN
           SELECT con.conname FROM pg_constraint con
           WHERE con.conrelid = 'inventory.sales_order_lines'::regclass
             AND con.contype = 'u'
             AND (SELECT array_agg(att.attname::text ORDER BY att.attname)
                  FROM pg_attribute att
                  WHERE att.attrelid = con.conrelid AND att.attnum = ANY(con.conkey))
                 = ARRAY['product_id', 'sales_order_id']
         LOOP
           EXECUTE format('ALTER TABLE inventory.sales_order_lines DROP CONSTRAINT %I', c.conname);
         END LOOP;
       END $$`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_sales_order_lines_order_product
         ON inventory.sales_order_lines (sales_order_id, product_id)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Restoring UNIQUE (sales_order_id, product_id) fails if any order now has
    // repeated products; merge those lines by hand before reverting.
    await queryRunner.query(
      `DROP INDEX IF EXISTS inventory.idx_sales_order_lines_order_product`,
    );
    await queryRunner.query(
      `ALTER TABLE inventory.sales_order_lines
         ADD CONSTRAINT sales_order_lines_sales_order_id_product_id_key UNIQUE (sales_order_id, product_id)`,
    );
    await queryRunner.query(
      `ALTER TABLE inventory.sales_order_lines
         DROP COLUMN IF EXISTS customer_po,
         DROP COLUMN IF EXISTS delivery_time,
         DROP COLUMN IF EXISTS delivery_point,
         DROP COLUMN IF EXISTS customer_line`,
    );
  }
}
