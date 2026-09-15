import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMaterialTypesMaster1786700000011 implements MigrationInterface {
  name = 'CreateMaterialTypesMaster1786700000011';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Master data for the material classification used on materials.type
    // (PC / OF / OF-MAT) — mirrors master.delivery_types / master.process_steps.
    // Lets the classification be picked from a dropdown / managed via CRUD
    // instead of only being a hardcoded validation list on the DTOs.
    await queryRunner.query(`
      CREATE TABLE master.material_types (
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

    // Seed the existing values already used by materials.type (see
    // 1786197666075-AddTypeToMaterial.ts) so the table starts populated
    // with the codes currently accepted by the create/update material DTOs.
    await queryRunner.query(`
      INSERT INTO master.material_types (code, name_th) VALUES
        ('PC', 'PC'),
        ('OF', 'OF'),
        ('OF_MAT', 'OF-MAT')
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS master.material_types`);
  }
}
