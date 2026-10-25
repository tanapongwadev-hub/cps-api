import { MigrationInterface, QueryRunner } from 'typeorm';

// เหตุผลการตัดสต็อกระดับรายการวัสดุ: reason = ตัวเลือก (หรือ "อื่นๆ"), reason_note = ข้อความเมื่อเลือก "อื่นๆ"
export class AddReasonToDisbursementItems1790600000048
  implements MigrationInterface
{
  name = 'AddReasonToDisbursementItems1790600000048';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE inventory.material_disbursement_items
         ADD COLUMN IF NOT EXISTS reason varchar(255) NULL,
         ADD COLUMN IF NOT EXISTS reason_note text NULL`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE inventory.material_disbursement_items
         DROP COLUMN IF EXISTS reason_note,
         DROP COLUMN IF EXISTS reason`,
    );
  }
}
