import { MigrationInterface, QueryRunner } from 'typeorm';

// ไฟล์แนบหลายไฟล์: attachments = [{url, name}] (คอลัมน์ attachment_url/name เดิมเก็บไฟล์แรกไว้เพื่อความเข้ากันได้)
export class AddAttachmentsToDisbursement1790600000049
  implements MigrationInterface
{
  name = 'AddAttachmentsToDisbursement1790600000049';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE inventory.materials_disbursements
         ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb`,
    );
    await queryRunner.query(
      `UPDATE inventory.materials_disbursements
          SET attachments = jsonb_build_array(jsonb_build_object(
            'url', attachment_url, 'name', COALESCE(attachment_name, 'ไฟล์แนบ')))
        WHERE attachment_url IS NOT NULL AND attachments = '[]'::jsonb`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE inventory.materials_disbursements DROP COLUMN IF EXISTS attachments`,
    );
  }
}
