import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAdditionalMasterTables1700000000007 implements MigrationInterface {
  name = 'CreateAdditionalMasterTables1700000000007';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS master`);

    await queryRunner.query(`
      CREATE TABLE master.categories (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        code VARCHAR(50) UNIQUE NOT NULL,
        name_th VARCHAR(100) NOT NULL,
        name_en VARCHAR(100),
        parent_id BIGINT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        icon_color VARCHAR(20),
        description TEXT,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_by BIGINT,
        updated_by BIGINT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (parent_id) REFERENCES master.categories(id) ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE master.status_items (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        code VARCHAR(50) UNIQUE NOT NULL,
        name_th VARCHAR(100) NOT NULL,
        name_en VARCHAR(100),
        color VARCHAR(20) NOT NULL DEFAULT 'info',
        module VARCHAR(50) NOT NULL,
        is_default BOOLEAN NOT NULL DEFAULT false,
        sort_order INTEGER NOT NULL DEFAULT 0,
        description TEXT,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_by BIGINT,
        updated_by BIGINT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await queryRunner.query(`
      CREATE TABLE master.organizations (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        code VARCHAR(50) UNIQUE NOT NULL,
        name_th VARCHAR(255) NOT NULL,
        name_en VARCHAR(255),
        tax_id VARCHAR(20),
        address TEXT,
        phone VARCHAR(50),
        email VARCHAR(255),
        website VARCHAR(255),
        logo_url VARCHAR(500),
        parent_id BIGINT,
        type VARCHAR(20) NOT NULL DEFAULT 'department',
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_by BIGINT,
        updated_by BIGINT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (parent_id) REFERENCES master.organizations(id) ON DELETE SET NULL
      )
    `);

    await queryRunner.query(
      `CREATE INDEX idx_categories_parent_id ON master.categories(parent_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_status_items_module ON master.status_items(module)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_organizations_parent_id ON master.organizations(parent_id)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS master.organizations`);
    await queryRunner.query(`DROP TABLE IF EXISTS master.status_items`);
    await queryRunner.query(`DROP TABLE IF EXISTS master.categories`);
  }
}
