import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateProductWorkflows1786700000006 implements MigrationInterface {
  name = 'CreateProductWorkflows1786700000006';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Product Workflows table — production routing header (version/status
    // mirrors master.product_boms, see AGENTS.md-style comment in the entity)
    await queryRunner.query(`
      CREATE TABLE master.product_workflows (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        product_id BIGINT NOT NULL,
        version VARCHAR(20) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
        remark TEXT,
        created_by BIGINT,
        updated_by BIGINT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES master.products(id) ON DELETE CASCADE,
        UNIQUE (product_id, version)
      )
    `);

    await queryRunner.query(
      `CREATE INDEX idx_product_workflows_product_id ON master.product_workflows(product_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_product_workflows_status ON master.product_workflows(status)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_product_workflows_product_status ON master.product_workflows(product_id, status)`,
    );

    // Product Workflow Steps table — ordered production steps for a workflow
    await queryRunner.query(`
      CREATE TABLE master.product_workflow_steps (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        workflow_id BIGINT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        step_name VARCHAR(255) NOT NULL,
        description TEXT,
        created_by BIGINT,
        updated_by BIGINT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (workflow_id) REFERENCES master.product_workflows(id) ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX idx_product_workflow_steps_workflow_id ON master.product_workflow_steps(workflow_id)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS master.product_workflow_steps`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS master.product_workflows`);
  }
}
