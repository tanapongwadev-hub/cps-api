import { MigrationInterface, QueryRunner } from 'typeorm';

// รายการแจ้งปัญหาที่ผูกกับเอกสาร (รับเข้า/จ่ายออก/ใบจัดงาน/แผนผลิต/ใบสั่งขาย ฯลฯ)
// เมนู ISSUE_REPORTS (/reports/issues) ใต้ "รายงานและตรวจสอบ"
// permission: ISSUE_REPORT_VIEW (READ), ISSUE_REPORT_CREATE (CREATE), ISSUE_REPORT_UPDATE (UPDATE)
// ขอบเขต ALL: ทุก role ที่มี action นั้นใช้ได้
export class CreateIssueReports1790600000057 implements MigrationInterface {
  name = 'CreateIssueReports1790600000057';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS inventory.issue_reports (
        id bigserial PRIMARY KEY,
        report_no varchar(30) NOT NULL UNIQUE,
        document_type varchar(40) NOT NULL,
        document_no varchar(100) NOT NULL,
        title varchar(200) NOT NULL,
        description text NULL,
        severity varchar(10) NOT NULL DEFAULT 'MEDIUM',
        status varchar(15) NOT NULL DEFAULT 'OPEN',
        resolution text NULL,
        reported_by bigint NULL REFERENCES iam.users(id),
        resolved_by bigint NULL REFERENCES iam.users(id),
        resolved_at timestamptz NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT chk_issue_reports_severity CHECK (severity IN ('LOW','MEDIUM','HIGH')),
        CONSTRAINT chk_issue_reports_status CHECK (status IN ('OPEN','IN_PROGRESS','RESOLVED','CLOSED'))
      )`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_issue_reports_status ON inventory.issue_reports (status, created_at DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_issue_reports_document ON inventory.issue_reports (document_type, document_no)`,
    );

    const parent = (await queryRunner.query(
      `SELECT id FROM iam.menus WHERE code = 'REPORTS_AUDIT'`,
    )) as Array<{ id: string }>;
    if (!parent[0]) return;
    const sort = (await queryRunner.query(
      `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM iam.menus WHERE parent_id = $1`,
      [parent[0].id],
    )) as Array<{ next: number | string }>;
    await queryRunner.query(
      `INSERT INTO iam.menus
        (code, name_th, name_en, menu_type, path, icon, sort_order, parent_id,
         is_visible, is_active, created_at, updated_at)
       VALUES
        ('ISSUE_REPORTS', 'รายการแจ้งปัญหา', 'Issue Reports', 'SUB',
         '/reports/issues', 'circle-alert', $1, $2, true, true,
         CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT (code) DO NOTHING`,
      [Number(sort[0].next), parent[0].id],
    );
    const permissions: Array<[string, string, string]> = [
      ['ISSUE_REPORT_VIEW', 'READ', 'ดูรายการแจ้งปัญหา'],
      ['ISSUE_REPORT_CREATE', 'CREATE', 'แจ้งปัญหาเอกสาร'],
      ['ISSUE_REPORT_UPDATE', 'UPDATE', 'อัปเดตสถานะการแจ้งปัญหา'],
    ];
    for (const [code, action, text] of permissions) {
      await queryRunner.query(
        `INSERT INTO iam.permissions
           (menu_id, action_id, code, description, access_scope, is_active, created_at, updated_at)
         SELECT menu.id, a.id, $1, $2, 'ALL', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
         FROM iam.menus menu CROSS JOIN iam.actions a
         WHERE menu.code = 'ISSUE_REPORTS' AND a.code = $3
         ON CONFLICT (code) DO NOTHING`,
        [code, text, action],
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const ids = `(SELECT id FROM iam.permissions WHERE code IN ('ISSUE_REPORT_VIEW','ISSUE_REPORT_CREATE','ISSUE_REPORT_UPDATE'))`;
    await queryRunner.query(
      `DELETE FROM iam.user_department_permissions WHERE permission_id IN ${ids}`,
    );
    await queryRunner.query(
      `DELETE FROM iam.department_permissions WHERE permission_id IN ${ids}`,
    );
    await queryRunner.query(
      `DELETE FROM iam.permissions WHERE code IN ('ISSUE_REPORT_VIEW','ISSUE_REPORT_CREATE','ISSUE_REPORT_UPDATE')`,
    );
    await queryRunner.query(`DELETE FROM iam.menus WHERE code = 'ISSUE_REPORTS'`);
    await queryRunner.query(`DROP TABLE IF EXISTS inventory.issue_reports`);
  }
}
