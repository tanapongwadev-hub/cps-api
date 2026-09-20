import { MigrationInterface, QueryRunner } from 'typeorm';

export class AllowDisbursementRefTypeOnStockTransactions1789900000000
  implements MigrationInterface
{
  name = 'AllowDisbursementRefTypeOnStockTransactions1789900000000';

  // stock_transactions.reference_type's check constraint (from the original
  // materials-receiving migration) only ever allowed 'MATERIAL_RECEIVING' —
  // the materials-disbursement module was later built to also write
  // reference_type: 'MATERIALS_DISBURSEMENT' rows (see
  // MaterialsDisbursementService#processFifoForItem/revertFifoForItem), but
  // the constraint was never widened, so every real confirm/cancel call
  // 500s with a check-constraint violation. Widens it to allow both values.
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE inventory.stock_transactions
      DROP CONSTRAINT chk_stock_transactions_ref_type
    `);
    await queryRunner.query(`
      ALTER TABLE inventory.stock_transactions
      ADD CONSTRAINT chk_stock_transactions_ref_type
      CHECK (reference_type IN ('MATERIAL_RECEIVING', 'MATERIALS_DISBURSEMENT'))
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE inventory.stock_transactions
      DROP CONSTRAINT chk_stock_transactions_ref_type
    `);
    await queryRunner.query(`
      ALTER TABLE inventory.stock_transactions
      ADD CONSTRAINT chk_stock_transactions_ref_type
      CHECK (reference_type IN ('MATERIAL_RECEIVING'))
    `);
  }
}
