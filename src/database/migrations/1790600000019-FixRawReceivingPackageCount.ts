import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixRawReceivingPackageCount1790600000019 implements MigrationInterface {
  name = 'FixRawReceivingPackageCount1790600000019';

  async up(runner: QueryRunner): Promise<void> {
    // Raw receipts keep every entered unit in one package until processing.
    // Historical multi-package receipts and processed outputs retain the old rule.
    await runner.query(`ALTER TABLE inventory.material_receivings
      DROP CONSTRAINT chk_material_receivings_package_count_fit,
      ADD CONSTRAINT chk_material_receivings_package_count_fit CHECK (
        (source_receiving_id IS NULL
          AND COALESCE(material_type IN ('PIPE', 'SHEET', 'COIL'), false)
          AND package_count = 1)
        OR package_count >= CEIL(receive_quantity / packing_quantity)
      )`);
  }

  async down(runner: QueryRunner): Promise<void> {
    const rows: { exists: boolean }[] = await runner.query(`SELECT EXISTS (
      SELECT 1 FROM inventory.material_receivings
      WHERE package_count < CEIL(receive_quantity / packing_quantity)
    ) AS exists`);
    if (rows[0].exists) {
      throw new Error('Cannot restore the old package-count rule while whole-unit raw receipts exist');
    }
    await runner.query(`ALTER TABLE inventory.material_receivings
      DROP CONSTRAINT chk_material_receivings_package_count_fit,
      ADD CONSTRAINT chk_material_receivings_package_count_fit
        CHECK (package_count >= CEIL(receive_quantity / packing_quantity))`);
  }
}
