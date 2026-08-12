import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fix bug: chk_material_receivings_confirmed_fields ทำงานผิด
 * - เดิม: ถ้า status = 'cancelled' ก็ต้องมี confirmed_by/at (ผิด!)
 * - ใหม่: เฉพาะ status = 'confirmed' เท่านั้นที่ต้องมี confirmed_by/at
 *
 * cancelled fields ถูกตรวจใน chk_material_receivings_cancelled_fields แยกแล้ว
 */
export class FixConfirmedFieldsCheckConstraint1786197666079
  implements MigrationInterface
{
  name = 'FixConfirmedFieldsCheckConstraint1786197666079';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE inventory.material_receivings
        DROP CONSTRAINT chk_material_receivings_confirmed_fields
    `);
    await queryRunner.query(`
      ALTER TABLE inventory.material_receivings
        ADD CONSTRAINT chk_material_receivings_confirmed_fields
        CHECK (
          status <> 'confirmed'
          OR (confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL)
        )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE inventory.material_receivings
        DROP CONSTRAINT chk_material_receivings_confirmed_fields
    `);
    await queryRunner.query(`
      ALTER TABLE inventory.material_receivings
        ADD CONSTRAINT chk_material_receivings_confirmed_fields
        CHECK (
          (status <> 'confirmed' AND status <> 'cancelled')
          OR (confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL)
        )
    `);
  }
}
