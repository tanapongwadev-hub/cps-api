import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMaterialCodeCaseInsensitiveIndex1700000000006
  implements MigrationInterface
{
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE UNIQUE INDEX uq_materials_code_ci ON master.materials (LOWER(code))',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS master.uq_materials_code_ci');
  }
}
