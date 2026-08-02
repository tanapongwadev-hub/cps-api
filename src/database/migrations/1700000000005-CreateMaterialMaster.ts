import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMaterialMaster1700000000005
  implements MigrationInterface
{
  name = 'CreateMaterialMaster1700000000005';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS master`);

    await queryRunner.query(`
      CREATE TABLE master.units (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        code VARCHAR(20) UNIQUE NOT NULL,
        name_th VARCHAR(100) NOT NULL,
        name_en VARCHAR(100),
        symbol VARCHAR(20),
        description TEXT,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_by BIGINT,
        updated_by BIGINT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await queryRunner.query(`
      CREATE TABLE master.delivery_types (
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

    await queryRunner.query(`
      CREATE TABLE master.material_models (
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

    await queryRunner.query(`
      CREATE TABLE master.loading_points (
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

    await queryRunner.query(`
      CREATE TABLE master.suppliers (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        code VARCHAR(50) UNIQUE NOT NULL,
        name_th VARCHAR(255) NOT NULL,
        name_en VARCHAR(255),
        tax_id VARCHAR(20),
        contact_name VARCHAR(255),
        telephone VARCHAR(50),
        email VARCHAR(255),
        address TEXT,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_by BIGINT,
        updated_by BIGINT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await queryRunner.query(`
      CREATE TABLE master.materials (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        code VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        unit_id BIGINT NOT NULL,
        delivery_type_id BIGINT,
        model_id BIGINT,
        loading_point_id BIGINT,
        process_line_name VARCHAR(255),
        scale VARCHAR(255),
        image_path VARCHAR(500),
        specification TEXT,
        description TEXT,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_by BIGINT,
        updated_by BIGINT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (unit_id) REFERENCES master.units(id) ON DELETE RESTRICT,
        FOREIGN KEY (delivery_type_id) REFERENCES master.delivery_types(id) ON DELETE RESTRICT,
        FOREIGN KEY (model_id) REFERENCES master.material_models(id) ON DELETE RESTRICT,
        FOREIGN KEY (loading_point_id) REFERENCES master.loading_points(id) ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE TABLE master.supplier_materials (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        material_id BIGINT NOT NULL,
        supplier_id BIGINT NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_by BIGINT,
        updated_by BIGINT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (material_id) REFERENCES master.materials(id) ON DELETE RESTRICT,
        FOREIGN KEY (supplier_id) REFERENCES master.suppliers(id) ON DELETE RESTRICT,
        UNIQUE (material_id, supplier_id)
      )
    `);

    await queryRunner.query(
      `CREATE INDEX idx_materials_unit_id ON master.materials(unit_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_materials_delivery_type_id ON master.materials(delivery_type_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_materials_model_id ON master.materials(model_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_materials_loading_point_id ON master.materials(loading_point_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_supplier_materials_material_id ON master.supplier_materials(material_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_supplier_materials_supplier_id ON master.supplier_materials(supplier_id)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS master.supplier_materials`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS master.materials`);
    await queryRunner.query(`DROP TABLE IF EXISTS master.suppliers`);
    await queryRunner.query(`DROP TABLE IF EXISTS master.loading_points`);
    await queryRunner.query(`DROP TABLE IF EXISTS master.material_models`);
    await queryRunner.query(`DROP TABLE IF EXISTS master.delivery_types`);
    await queryRunner.query(`DROP TABLE IF EXISTS master.units`);
    await queryRunner.query(`DROP SCHEMA IF EXISTS master`);
  }
}
