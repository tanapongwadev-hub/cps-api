import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateProductStockMovements1790600000020 implements MigrationInterface {
  name = 'CreateProductStockMovements1790600000020';

  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`CREATE TABLE inventory.product_stock_movements (
      id BIGSERIAL PRIMARY KEY,
      product_id BIGINT NOT NULL REFERENCES master.products(id) ON DELETE RESTRICT,
      request_id UUID NOT NULL,
      type VARCHAR(10) NOT NULL CHECK (type IN ('receive', 'issue')),
      quantity NUMERIC(18,4) NOT NULL CHECK (quantity > 0),
      balance_after NUMERIC(18,4) NOT NULL CHECK (balance_after >= 0),
      reference_no VARCHAR(100) NOT NULL CHECK (length(trim(reference_no)) > 0),
      remark VARCHAR(1000),
      recorded_by BIGINT NOT NULL REFERENCES iam.users(id) ON DELETE RESTRICT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT uq_product_stock_request UNIQUE (product_id, request_id)
    )`);
    await runner.query(`CREATE INDEX idx_product_stock_history
      ON inventory.product_stock_movements (product_id, id DESC)`);
  }

  async down(runner: QueryRunner): Promise<void> {
    const rows: { exists: boolean }[] = await runner.query(
      'SELECT EXISTS (SELECT 1 FROM inventory.product_stock_movements) AS exists',
    );
    if (rows[0].exists) throw new Error('Cannot remove product stock while movement history exists');
    await runner.query('DROP TABLE inventory.product_stock_movements');
  }
}
