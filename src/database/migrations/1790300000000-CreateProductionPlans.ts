import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateProductionPlans1790300000000 implements MigrationInterface {
  name = 'CreateProductionPlans1790300000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE inventory.production_plans (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        code VARCHAR(20) NOT NULL,
        title VARCHAR(255),
        status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
        remark TEXT,
        created_by BIGINT,
        approved_by BIGINT,
        approved_at TIMESTAMP,
        issued_by BIGINT,
        issued_at TIMESTAMP,
        cancelled_by BIGINT,
        cancelled_at TIMESTAMP,
        cancel_reason VARCHAR(500),
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uq_production_plans_code UNIQUE (code),
        CONSTRAINT chk_production_plans_status CHECK (
          status IN ('DRAFT', 'APPROVED', 'ISSUED', 'CANCELLED', 'EXPIRED')
        ),
        CONSTRAINT chk_production_plans_cancel_reason CHECK (
          status NOT IN ('CANCELLED', 'EXPIRED') OR cancel_reason IS NOT NULL
        )
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_production_plans_status
        ON inventory.production_plans(status)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_production_plans_created_at
        ON inventory.production_plans(created_at DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_production_plans_approved_at
        ON inventory.production_plans(approved_at)
        WHERE status = 'APPROVED'
    `);

    await queryRunner.query(`
      CREATE TABLE inventory.production_plan_lines (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        production_plan_id BIGINT NOT NULL,
        product_id BIGINT NOT NULL,
        bom_id BIGINT NOT NULL,
        quantity INTEGER NOT NULL,
        need_by_date DATE NOT NULL,
        remark TEXT,
        created_by BIGINT,
        updated_by BIGINT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT chk_production_plan_lines_quantity CHECK (quantity > 0),
        CONSTRAINT fk_production_plan_lines_plan
          FOREIGN KEY (production_plan_id)
          REFERENCES inventory.production_plans(id)
          ON DELETE CASCADE,
        CONSTRAINT fk_production_plan_lines_product
          FOREIGN KEY (product_id)
          REFERENCES master.products(id)
          ON DELETE RESTRICT,
        CONSTRAINT fk_production_plan_lines_bom
          FOREIGN KEY (bom_id)
          REFERENCES master.product_boms(id)
          ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_production_plan_lines_plan
        ON inventory.production_plan_lines(production_plan_id)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_production_plan_lines_product
        ON inventory.production_plan_lines(product_id)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_production_plan_lines_bom
        ON inventory.production_plan_lines(bom_id)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_production_plan_lines_need_by_date
        ON inventory.production_plan_lines(need_by_date)
    `);

    await queryRunner.query(`
      CREATE TABLE inventory.production_plan_reservations (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        production_plan_line_id BIGINT NOT NULL,
        material_receiving_package_id BIGINT NOT NULL,
        reserved_quantity NUMERIC(18,4) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        released_at TIMESTAMP,
        release_type VARCHAR(20),
        released_by BIGINT,
        CONSTRAINT uq_production_plan_reservation_line_package
          UNIQUE (production_plan_line_id, material_receiving_package_id),
        CONSTRAINT chk_production_plan_reservations_quantity
          CHECK (reserved_quantity > 0),
        CONSTRAINT chk_production_plan_reservations_release_type
          CHECK (release_type IS NULL OR release_type IN ('ISSUED', 'CANCELLED', 'EXPIRED')),
        CONSTRAINT chk_production_plan_reservations_release_state
          CHECK (
            (released_at IS NULL AND release_type IS NULL AND released_by IS NULL)
            OR (released_at IS NOT NULL AND release_type IS NOT NULL)
          ),
        CONSTRAINT fk_production_plan_reservations_line
          FOREIGN KEY (production_plan_line_id)
          REFERENCES inventory.production_plan_lines(id)
          ON DELETE CASCADE,
        CONSTRAINT fk_production_plan_reservations_package
          FOREIGN KEY (material_receiving_package_id)
          REFERENCES inventory.material_receiving_packages(id)
          ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_production_plan_reservations_line
        ON inventory.production_plan_reservations(production_plan_line_id)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_production_plan_reservations_package
        ON inventory.production_plan_reservations(material_receiving_package_id)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_production_plan_reservations_active_package
        ON inventory.production_plan_reservations(material_receiving_package_id)
        WHERE released_at IS NULL
    `);

    await queryRunner.query(`
      ALTER TABLE inventory.materials_disbursements
      ADD COLUMN production_plan_id BIGINT
    `);
    await queryRunner.query(`
      ALTER TABLE inventory.materials_disbursements
      ADD CONSTRAINT fk_materials_disbursements_production_plan
        FOREIGN KEY (production_plan_id)
        REFERENCES inventory.production_plans(id)
        ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      CREATE INDEX idx_materials_disbursements_production_plan
        ON inventory.materials_disbursements(production_plan_id)
        WHERE production_plan_id IS NOT NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS inventory.idx_materials_disbursements_production_plan
    `);
    await queryRunner.query(`
      ALTER TABLE inventory.materials_disbursements
      DROP CONSTRAINT IF EXISTS fk_materials_disbursements_production_plan
    `);
    await queryRunner.query(`
      ALTER TABLE inventory.materials_disbursements
      DROP COLUMN IF EXISTS production_plan_id
    `);
    await queryRunner.query(
      `DROP TABLE IF EXISTS inventory.production_plan_reservations`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS inventory.production_plan_lines`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS inventory.production_plans`);
  }
}
