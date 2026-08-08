import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPoNoToGoodsReceiptItems1700000000010
  implements MigrationInterface
{
  name = 'AddPoNoToGoodsReceiptItems1700000000010';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE inventory.goods_receipt_items
      ADD COLUMN IF NOT EXISTS po_no VARCHAR(50) NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE inventory.goods_receipt_items
      DROP COLUMN IF EXISTS po_no
    `);
  }
}
