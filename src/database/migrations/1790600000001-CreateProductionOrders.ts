import { MigrationInterface, QueryRunner } from 'typeorm';

const PERMISSIONS = [
  ['READ', 'PRODUCTION_ORDER_VIEW', 'ดูใบสั่งผลิต'],
  ['CREATE', 'PRODUCTION_ORDER_CREATE', 'สั่งผลิต'],
  ['UPDATE', 'PRODUCTION_ORDER_ADVANCE', 'เลื่อนขั้นตอนการผลิต'],
] as const;

export class CreateProductionOrders1790600000001 implements MigrationInterface {
  name = 'CreateProductionOrders1790600000001';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE inventory.production_orders (
        id BIGSERIAL PRIMARY KEY,
        code VARCHAR(20) NOT NULL,
        production_plan_id BIGINT NOT NULL REFERENCES inventory.production_plans(id),
        status VARCHAR(20) NOT NULL DEFAULT 'IN_PROGRESS',
        completed_at TIMESTAMP NULL,
        created_by BIGINT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        updated_at TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT chk_production_orders_status CHECK (status IN ('IN_PROGRESS','COMPLETED'))
      )`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX uq_production_orders_code ON inventory.production_orders (code)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX uq_production_orders_plan ON inventory.production_orders (production_plan_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_production_orders_status ON inventory.production_orders (status)`,
    );

    await queryRunner.query(`
      CREATE TABLE inventory.production_order_lines (
        id BIGSERIAL PRIMARY KEY,
        production_order_id BIGINT NOT NULL REFERENCES inventory.production_orders(id) ON DELETE CASCADE,
        line_no INTEGER NOT NULL,
        product_id BIGINT NOT NULL REFERENCES master.products(id),
        workflow_id BIGINT NOT NULL REFERENCES master.product_workflows(id),
        quantity INTEGER NOT NULL CHECK (quantity > 0),
        packing_quantity INTEGER NOT NULL CHECK (packing_quantity > 0)
      )`);
    await queryRunner.query(
      `CREATE INDEX idx_production_order_lines_order ON inventory.production_order_lines (production_order_id)`,
    );

    await queryRunner.query(`
      CREATE TABLE inventory.production_order_packets (
        id BIGSERIAL PRIMARY KEY,
        production_order_line_id BIGINT NOT NULL REFERENCES inventory.production_order_lines(id) ON DELETE CASCADE,
        packet_no INTEGER NOT NULL,
        qr_code VARCHAR(60) NOT NULL,
        quantity INTEGER NOT NULL CHECK (quantity > 0),
        current_step_index INTEGER NOT NULL DEFAULT 0,
        status VARCHAR(20) NOT NULL DEFAULT 'IN_PROGRESS',
        step_updated_at TIMESTAMP NULL,
        step_updated_by BIGINT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        updated_at TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT chk_production_order_packets_status CHECK (status IN ('IN_PROGRESS','COMPLETED'))
      )`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX uq_production_order_packets_qr ON inventory.production_order_packets (qr_code)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_production_order_packets_line ON inventory.production_order_packets (production_order_line_id)`,
    );

    for (const [actionCode, permissionCode, label] of PERMISSIONS) {
      await queryRunner.query(
        `INSERT INTO iam.permissions
           (menu_id, action_id, code, description, is_active, created_at, updated_at)
         SELECT menu.id, action.id, $2, 'การสั่งผลิตตามกระบวนการ — ' || $3,
                true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
         FROM iam.menus menu
         CROSS JOIN iam.actions action
         WHERE menu.code = 'PRODUCT_PROCESS_ORDERS'
           AND action.code = $1
         ON CONFLICT (code) DO NOTHING`,
        [actionCode, permissionCode, label],
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM iam.permissions WHERE code LIKE 'PRODUCTION_ORDER_%'`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS inventory.production_order_packets`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS inventory.production_order_lines`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS inventory.production_orders`);
  }
}
