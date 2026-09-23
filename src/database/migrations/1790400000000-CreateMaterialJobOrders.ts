import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMaterialJobOrders1790400000000
  implements MigrationInterface
{
  name = 'CreateMaterialJobOrders1790400000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE inventory.material_job_orders (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        code VARCHAR(20) NOT NULL,
        production_plan_id BIGINT NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'WAITING_PICKING',
        version INTEGER NOT NULL DEFAULT 1,
        print_count INTEGER NOT NULL DEFAULT 0,
        last_printed_by BIGINT,
        last_printed_at TIMESTAMP,
        completed_by BIGINT,
        completed_at TIMESTAMP,
        cancelled_by BIGINT,
        cancelled_at TIMESTAMP,
        cancel_reason VARCHAR(500),
        created_by BIGINT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uq_material_job_orders_code UNIQUE (code),
        CONSTRAINT uq_material_job_orders_plan UNIQUE (production_plan_id),
        CONSTRAINT chk_material_job_orders_status CHECK (
          status IN (
            'WAITING_PICKING', 'READY_TO_ISSUE', 'PARTIALLY_ISSUED',
            'ISSUED', 'CANCELLED'
          )
        ),
        CONSTRAINT chk_material_job_orders_cancel_reason CHECK (
          status <> 'CANCELLED' OR cancel_reason IS NOT NULL
        ),
        CONSTRAINT fk_material_job_orders_plan
          FOREIGN KEY (production_plan_id)
          REFERENCES inventory.production_plans(id)
          ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_material_job_orders_status
        ON inventory.material_job_orders(status)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_material_job_orders_created_at
        ON inventory.material_job_orders(created_at DESC)
    `);

    await queryRunner.query(`
      ALTER TABLE inventory.production_plan_reservations
      ADD COLUMN issued_quantity NUMERIC(18,4) NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      ALTER TABLE inventory.production_plan_reservations
      ADD COLUMN picked_at TIMESTAMP
    `);
    await queryRunner.query(`
      ALTER TABLE inventory.production_plan_reservations
      ADD COLUMN picked_by BIGINT
    `);
    await queryRunner.query(`
      ALTER TABLE inventory.production_plan_reservations
      ADD CONSTRAINT chk_production_plan_reservations_issued_quantity
        CHECK (issued_quantity >= 0 AND issued_quantity <= reserved_quantity)
    `);

    await queryRunner.query(`
      ALTER TABLE inventory.materials_disbursements
      ADD COLUMN material_job_order_id BIGINT
    `);
    await queryRunner.query(`
      ALTER TABLE inventory.materials_disbursements
      ADD CONSTRAINT fk_materials_disbursements_material_job_order
        FOREIGN KEY (material_job_order_id)
        REFERENCES inventory.material_job_orders(id)
        ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      CREATE INDEX idx_materials_disbursements_material_job_order
        ON inventory.materials_disbursements(material_job_order_id)
        WHERE material_job_order_id IS NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE inventory.material_disbursement_packages
      ADD COLUMN production_plan_reservation_id BIGINT
    `);
    await queryRunner.query(`
      ALTER TABLE inventory.material_disbursement_packages
      ADD CONSTRAINT fk_material_disbursement_packages_reservation
        FOREIGN KEY (production_plan_reservation_id)
        REFERENCES inventory.production_plan_reservations(id)
        ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      CREATE INDEX idx_material_disbursement_packages_reservation
        ON inventory.material_disbursement_packages(production_plan_reservation_id)
        WHERE production_plan_reservation_id IS NOT NULL
    `);

    // Backfill: give every already-APPROVED/ISSUED plan a Job Order so the
    // new page has something to show for plans created before this feature.
    await queryRunner.query(`
      INSERT INTO inventory.material_job_orders
        (code, production_plan_id, status, created_by, created_at, updated_at,
         completed_by, completed_at, cancelled_by, cancelled_at, cancel_reason)
      SELECT
        'JO-' || TO_CHAR(plan.approved_at, 'YYYYMMDD') || '-' ||
          LPAD(ROW_NUMBER() OVER (
            PARTITION BY TO_CHAR(plan.approved_at, 'YYYYMMDD')
            ORDER BY plan.approved_at, plan.id
          )::text, 4, '0'),
        plan.id,
        CASE
          WHEN plan.status = 'ISSUED' THEN 'ISSUED'
          WHEN plan.status IN ('CANCELLED', 'EXPIRED') THEN 'CANCELLED'
          ELSE 'WAITING_PICKING'
        END,
        plan.approved_by,
        plan.approved_at,
        plan.approved_at,
        CASE WHEN plan.status = 'ISSUED' THEN plan.issued_by ELSE NULL END,
        CASE WHEN plan.status = 'ISSUED' THEN plan.issued_at ELSE NULL END,
        CASE WHEN plan.status IN ('CANCELLED', 'EXPIRED') THEN plan.cancelled_by ELSE NULL END,
        CASE WHEN plan.status IN ('CANCELLED', 'EXPIRED') THEN plan.cancelled_at ELSE NULL END,
        CASE
          WHEN plan.status IN ('CANCELLED', 'EXPIRED')
            THEN COALESCE(plan.cancel_reason, 'ยกเลิกก่อนมีใบจัดงาน')
          ELSE NULL
        END
      FROM inventory.production_plans plan
      WHERE plan.approved_at IS NOT NULL
    `);

    await queryRunner.query(`
      UPDATE inventory.production_plan_reservations reservation
      SET issued_quantity = reservation.reserved_quantity
      WHERE reservation.release_type = 'ISSUED'
    `);

    await queryRunner.query(`
      UPDATE inventory.materials_disbursements disbursement
      SET material_job_order_id = jo.id
      FROM inventory.material_job_orders jo
      WHERE disbursement.production_plan_id = jo.production_plan_id
        AND disbursement.production_plan_id IS NOT NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS inventory.idx_material_disbursement_packages_reservation
    `);
    await queryRunner.query(`
      ALTER TABLE inventory.material_disbursement_packages
      DROP CONSTRAINT IF EXISTS fk_material_disbursement_packages_reservation
    `);
    await queryRunner.query(`
      ALTER TABLE inventory.material_disbursement_packages
      DROP COLUMN IF EXISTS production_plan_reservation_id
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS inventory.idx_materials_disbursements_material_job_order
    `);
    await queryRunner.query(`
      ALTER TABLE inventory.materials_disbursements
      DROP CONSTRAINT IF EXISTS fk_materials_disbursements_material_job_order
    `);
    await queryRunner.query(`
      ALTER TABLE inventory.materials_disbursements
      DROP COLUMN IF EXISTS material_job_order_id
    `);

    await queryRunner.query(`
      ALTER TABLE inventory.production_plan_reservations
      DROP CONSTRAINT IF EXISTS chk_production_plan_reservations_issued_quantity
    `);
    await queryRunner.query(`
      ALTER TABLE inventory.production_plan_reservations
      DROP COLUMN IF EXISTS picked_by
    `);
    await queryRunner.query(`
      ALTER TABLE inventory.production_plan_reservations
      DROP COLUMN IF EXISTS picked_at
    `);
    await queryRunner.query(`
      ALTER TABLE inventory.production_plan_reservations
      DROP COLUMN IF EXISTS issued_quantity
    `);

    await queryRunner.query(
      `DROP TABLE IF EXISTS inventory.material_job_orders`,
    );
  }
}
