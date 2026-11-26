import { MigrationInterface, QueryRunner } from 'typeorm';

// แจ้งปัญหาจากฟอร์มสร้างจ่ายออกได้ก่อนเอกสารมีเลข — เลขจะถูกเติมเมื่อบันทึกเอกสาร
export class AllowIssueReportWithoutDocumentNo1790600000061
  implements MigrationInterface
{
  name = 'AllowIssueReportWithoutDocumentNo1790600000061';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE inventory.issue_reports ALTER COLUMN document_no DROP NOT NULL`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE inventory.issue_reports SET document_no = '-' WHERE document_no IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE inventory.issue_reports ALTER COLUMN document_no SET NOT NULL`,
    );
  }
}
