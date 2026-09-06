import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProcessStepsMaster1786700000007
  implements MigrationInterface
{
  name = 'AddProcessStepsMaster1786700000007';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Master data for Product Workflow steps — mirrors master.delivery_types
    // (see 1700000000005-CreateMaterialMaster.ts). Lets a workflow step be
    // picked from a dropdown instead of typed as free text.
    await queryRunner.query(`
      CREATE TABLE master.process_steps (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        code VARCHAR(50) UNIQUE NOT NULL,
        name_th VARCHAR(100) NOT NULL,
        name_en VARCHAR(100),
        description TEXT,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_by BIGINT,
        updated_by BIGINT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Seed the example steps the feature was requested with — an editable
    // starting catalog, not a fixed enum (admins can add/deactivate more via
    // the /process-steps CRUD endpoints).
    await queryRunner.query(`
      INSERT INTO master.process_steps (code, name_th) VALUES
        ('PS-01', 'สั่งผลิต'),
        ('PS-02', 'นำไปเชื่อมชิ้นงาน'),
        ('PS-03', 'นำไป CNC'),
        ('PS-04', 'นำไปปั๊ม'),
        ('PS-05', 'นำไปขัด'),
        ('PS-06', 'นำไปเช็ค'),
        ('PS-07', 'นำไป QC'),
        ('PS-08', 'ปิดกระบวนการผลิต')
    `);

    // Switch product_workflow_steps.step_name (free text) to a FK reference
    // into the new master table. No real production data exists on this
    // column yet (the module was added the same day), so a straightforward
    // add-backfill-constrain-drop sequence is safe here.
    await queryRunner.query(
      `ALTER TABLE master.product_workflow_steps ADD COLUMN process_step_id BIGINT`,
    );
    await queryRunner.query(`
      UPDATE master.product_workflow_steps
      SET process_step_id = (SELECT id FROM master.process_steps ORDER BY id LIMIT 1)
      WHERE process_step_id IS NULL
    `);
    await queryRunner.query(
      `ALTER TABLE master.product_workflow_steps ALTER COLUMN process_step_id SET NOT NULL`,
    );
    await queryRunner.query(`
      ALTER TABLE master.product_workflow_steps
      ADD CONSTRAINT fk_product_workflow_steps_process_step
      FOREIGN KEY (process_step_id) REFERENCES master.process_steps(id) ON DELETE RESTRICT
    `);
    await queryRunner.query(
      `CREATE INDEX idx_product_workflow_steps_process_step_id ON master.product_workflow_steps(process_step_id)`,
    );
    await queryRunner.query(
      `ALTER TABLE master.product_workflow_steps DROP COLUMN step_name`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE master.product_workflow_steps ADD COLUMN step_name VARCHAR(255)`,
    );
    await queryRunner.query(`
      UPDATE master.product_workflow_steps pws
      SET step_name = ps.name_th
      FROM master.process_steps ps
      WHERE ps.id = pws.process_step_id
    `);
    await queryRunner.query(
      `ALTER TABLE master.product_workflow_steps ALTER COLUMN step_name SET NOT NULL`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS master.idx_product_workflow_steps_process_step_id`,
    );
    await queryRunner.query(`
      ALTER TABLE master.product_workflow_steps
      DROP CONSTRAINT IF EXISTS fk_product_workflow_steps_process_step
    `);
    await queryRunner.query(
      `ALTER TABLE master.product_workflow_steps DROP COLUMN process_step_id`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS master.process_steps`);
  }
}
