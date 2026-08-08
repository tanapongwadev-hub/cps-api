import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFileFieldsToGoodsReceiptItems1700000000012
  implements MigrationInterface
{
  name = 'AddFileFieldsToGoodsReceiptItems1700000000012';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE inventory.goods_receipt_items
      ADD COLUMN IF NOT EXISTS file_path VARCHAR(500) NULL,
      ADD COLUMN IF NOT EXISTS file_name VARCHAR(255) NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE inventory.goods_receipt_items
      DROP COLUMN IF EXISTS file_path,
      DROP COLUMN IF EXISTS file_name
    `);
  }
}
