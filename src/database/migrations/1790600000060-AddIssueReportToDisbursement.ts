import { MigrationInterface, QueryRunner } from 'typeorm';

// ตัดสต็อกอ้างอิงรายการแจ้งปัญหา แทนการแนบไฟล์ (เอกสารเก่ายังเก็บไฟล์แนบเดิมไว้)
export class AddIssueReportToDisbursement1790600000060
  implements MigrationInterface
{
  name = 'AddIssueReportToDisbursement1790600000060';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE inventory.materials_disbursements
         ADD COLUMN IF NOT EXISTS issue_report_id bigint NULL
         REFERENCES inventory.issue_reports(id) ON DELETE SET NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_materials_disbursements_issue_report
         ON inventory.materials_disbursements (issue_report_id)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS inventory.idx_materials_disbursements_issue_report`,
    );
    await queryRunner.query(
      `ALTER TABLE inventory.materials_disbursements DROP COLUMN IF EXISTS issue_report_id`,
    );
  }
}
