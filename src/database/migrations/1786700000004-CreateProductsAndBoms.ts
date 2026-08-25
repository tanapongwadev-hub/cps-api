import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateProductsAndBoms1786700000004 implements MigrationInterface {
  name = 'CreateProductsAndBoms1786700000004';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Products table
    await queryRunner.query(`
      CREATE TABLE master.products (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        code VARCHAR(50) UNIQUE NOT NULL,
        name_th VARCHAR(255) NOT NULL,
        name_en VARCHAR(255),
        description TEXT,
        specification TEXT,
        category_id BIGINT NOT NULL,
        product_type VARCHAR(10) NOT NULL DEFAULT 'FG',
        brand VARCHAR(255),
        model VARCHAR(500),
        oem_part_number VARCHAR(100),
        unit_id BIGINT NOT NULL,
        process_line_name VARCHAR(255),
        production_process VARCHAR(255),
        cycle_time_minutes NUMERIC(10,2),
        weight NUMERIC(12,4),
        hs_code VARCHAR(20),
        min_stock NUMERIC(14,4),
        max_stock NUMERIC(14,4),
        unit_price NUMERIC(14,2),
        currency VARCHAR(3) NOT NULL DEFAULT 'THB',
        image_path VARCHAR(500),
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_by BIGINT,
        updated_by BIGINT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (category_id) REFERENCES master.categories(id) ON DELETE RESTRICT,
        FOREIGN KEY (unit_id) REFERENCES master.units(id) ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(
      `CREATE INDEX idx_products_category_id ON master.products(category_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_products_unit_id ON master.products(unit_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_products_is_active ON master.products(is_active)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_products_product_type ON master.products(product_type)`,
    );

    // Product BOMs table
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

    // Product BOM Items table
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
  }
}
