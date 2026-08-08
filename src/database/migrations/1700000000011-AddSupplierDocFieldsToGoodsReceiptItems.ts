import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSupplierDocFieldsToGoodsReceiptItems1700000000011
  implements MigrationInterface
{
  name = 'AddSupplierDocFieldsToGoodsReceiptItems1700000000011';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE inventory.goods_receipt_items
      ADD COLUMN IF NOT EXISTS supplier_doc_no VARCHAR(50) NULL,
      ADD COLUMN IF NOT EXISTS supplier_doc_date DATE NULL,
      ADD COLUMN IF NOT EXISTS no_supplier_document BOOLEAN NOT NULL DEFAULT FALSE
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE inventory.goods_receipt_items
      DROP COLUMN IF EXISTS supplier_doc_no,
      DROP COLUMN IF EXISTS supplier_doc_date,
      DROP COLUMN IF EXISTS no_supplier_document
    `);
  }
}
