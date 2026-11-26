import { MigrationInterface, QueryRunner } from 'typeorm';

// รหัสพนักงาน (แสดงบนป้าย QR ใบสั่งผลิต) — ไม่บังคับ แต่ห้ามซ้ำเมื่อมีค่า
export class AddEmployeeCodeToUsers1790600000059 implements MigrationInterface {
  name = 'AddEmployeeCodeToUsers1790600000059';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE iam.users ADD COLUMN IF NOT EXISTS employee_code varchar(30) NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_users_employee_code ON iam.users (lower(employee_code)) WHERE employee_code IS NOT NULL`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS iam.uq_users_employee_code`);
    await queryRunner.query(
      `ALTER TABLE iam.users DROP COLUMN IF EXISTS employee_code`,
    );
  }
}
