import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Rebuild products schema to the new spec:
 *   id, code, name, unit_id, model_id, customer_id, packing, location_id,
 *   safety_stock (computed from lot_size), product_type_id, lot_size,
 *   min_stock (computed from packing), delivery_type_id, scale,
 *   loading_point_id, process_line_id, product_image_path
 *
 * Also adds 5 new master tables: product_models, customers, locations,
 * product_types, process_lines.
 *
 * Old product columns (name_th/en, category_id, product_type varchar,
 * brand, model, oem_part_number, process_line_name, production_process,
 * cycle_time_minutes, weight, hs_code, max_stock, unit_price, currency,
 * image_path) are dropped — they are not part of the new spec.
 *
 * Existing BOMs/items are CASCADE-dropped with the products table and will
 * be re-seeded by seed-master-data.ts (skipped if user has real data).
 */
export class RebuildProductsAndAddMasters1786700000005 implements MigrationInterface {
  name = 'RebuildProductsAndAddMasters1786700000005';

  async up(queryRunner: QueryRunner): Promise<void> {
    // 1) Drop dependent tables first
    await queryRunner.query(`DROP TABLE IF EXISTS master.product_bom_items`);
    await queryRunner.query(`DROP TABLE IF EXISTS master.product_boms`);
    await queryRunner.query(`DROP TABLE IF EXISTS master.products`);

    // 2) New master tables --------------------------------------------------

    await queryRunner.query(`
      CREATE TABLE master.product_models (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        code VARCHAR(50) UNIQUE NOT NULL,
        name_th VARCHAR(255) NOT NULL,
        name_en VARCHAR(255),
        brand VARCHAR(100),
        description TEXT,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await queryRunner.query(`
      CREATE TABLE master.customers (
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
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await queryRunner.query(`
      CREATE TABLE master.locations (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        code VARCHAR(50) UNIQUE NOT NULL,
        name_th VARCHAR(255) NOT NULL,
        name_en VARCHAR(255),
        zone VARCHAR(100),
        warehouse VARCHAR(100),
        description TEXT,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await queryRunner.query(`
      CREATE TABLE master.product_types (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        code VARCHAR(20) UNIQUE NOT NULL,
        name_th VARCHAR(100) NOT NULL,
        name_en VARCHAR(100),
        description TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await queryRunner.query(`
      CREATE TABLE master.process_lines (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        code VARCHAR(50) UNIQUE NOT NULL,
        name_th VARCHAR(255) NOT NULL,
        name_en VARCHAR(255),
        description TEXT,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 3) New products schema ------------------------------------------------

    await queryRunner.query(`
      CREATE TABLE master.products (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        code VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        unit_id BIGINT NOT NULL,
        model_id BIGINT NOT NULL,
        customer_id BIGINT NOT NULL,
        packing INTEGER NOT NULL DEFAULT 1,
        location_id BIGINT NOT NULL,
        safety_stock INTEGER NOT NULL DEFAULT 0,
        product_type_id BIGINT NOT NULL,
        lot_size INTEGER NOT NULL DEFAULT 1,
        min_stock INTEGER NOT NULL DEFAULT 0,
        delivery_type_id BIGINT NOT NULL,
        scale VARCHAR(50),
        loading_point_id BIGINT NOT NULL,
        process_line_id BIGINT NOT NULL,
        product_image_path VARCHAR(500),
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_by BIGINT,
        updated_by BIGINT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (unit_id)         REFERENCES master.units(id)         ON DELETE RESTRICT,
        FOREIGN KEY (model_id)        REFERENCES master.product_models(id) ON DELETE RESTRICT,
        FOREIGN KEY (customer_id)     REFERENCES master.customers(id)     ON DELETE RESTRICT,
        FOREIGN KEY (location_id)     REFERENCES master.locations(id)     ON DELETE RESTRICT,
        FOREIGN KEY (product_type_id) REFERENCES master.product_types(id) ON DELETE RESTRICT,
        FOREIGN KEY (delivery_type_id) REFERENCES master.delivery_types(id) ON DELETE RESTRICT,
        FOREIGN KEY (loading_point_id) REFERENCES master.loading_points(id) ON DELETE RESTRICT,
        FOREIGN KEY (process_line_id) REFERENCES master.process_lines(id) ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(
      `CREATE INDEX idx_products_unit_id ON master.products(unit_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_products_model_id ON master.products(model_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_products_customer_id ON master.products(customer_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_products_location_id ON master.products(location_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_products_product_type_id ON master.products(product_type_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_products_delivery_type_id ON master.products(delivery_type_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_products_loading_point_id ON master.products(loading_point_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_products_process_line_id ON master.products(process_line_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_products_is_active ON master.products(is_active)`,
    );

    // 4) Re-create product_boms + product_bom_items (unchanged structure)

    await queryRunner.query(`
      CREATE TABLE master.product_boms (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        product_id BIGINT NOT NULL,
        version VARCHAR(20) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
        specification TEXT,
        remark TEXT,
        effective_from DATE,
        effective_to DATE,
        created_by BIGINT,
        updated_by BIGINT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES master.products(id) ON DELETE CASCADE,
        UNIQUE (product_id, version)
      )
    `);

    await queryRunner.query(
      `CREATE INDEX idx_product_boms_product_id ON master.product_boms(product_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_product_boms_status ON master.product_boms(status)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_product_boms_product_status ON master.product_boms(product_id, status)`,
    );

    await queryRunner.query(`
      CREATE TABLE master.product_bom_items (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        bom_id BIGINT NOT NULL,
        material_id BIGINT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        quantity NUMERIC(14,4) NOT NULL,
        unit_id BIGINT NOT NULL,
        is_scrap BOOLEAN NOT NULL DEFAULT false,
        wastage_percent NUMERIC(5,2),
        remark TEXT,
        created_by BIGINT,
        updated_by BIGINT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (bom_id) REFERENCES master.product_boms(id) ON DELETE CASCADE,
        FOREIGN KEY (material_id) REFERENCES master.materials(id) ON DELETE RESTRICT,
        FOREIGN KEY (unit_id) REFERENCES master.units(id) ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(
      `CREATE INDEX idx_product_bom_items_bom_id ON master.product_bom_items(bom_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_product_bom_items_material_id ON master.product_bom_items(material_id)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS master.product_bom_items`);
    await queryRunner.query(`DROP TABLE IF EXISTS master.product_boms`);
    await queryRunner.query(`DROP TABLE IF EXISTS master.products`);
    await queryRunner.query(`DROP TABLE IF EXISTS master.process_lines`);
    await queryRunner.query(`DROP TABLE IF EXISTS master.product_types`);
    await queryRunner.query(`DROP TABLE IF EXISTS master.locations`);
    await queryRunner.query(`DROP TABLE IF EXISTS master.customers`);
    await queryRunner.query(`DROP TABLE IF EXISTS master.product_models`);
  }
}
