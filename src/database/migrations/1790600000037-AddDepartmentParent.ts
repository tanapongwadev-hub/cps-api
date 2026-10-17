import { MigrationInterface, QueryRunner } from 'typeorm';

// แผนกแบบสองระดับ: กลุ่ม (materials / production / delivery) และแผนกย่อย
// parent_id ว่าง = กลุ่มระดับบนสุด แผนกย่อยสืบทอดสิทธิ์ที่กลุ่มได้รับ
export class AddDepartmentParent1790600000037 implements MigrationInterface {
  name = 'AddDepartmentParent1790600000037';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE iam.departments ADD COLUMN IF NOT EXISTS parent_id BIGINT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE iam.departments
         ADD CONSTRAINT fk_departments_parent
         FOREIGN KEY (parent_id) REFERENCES iam.departments(id) ON DELETE RESTRICT`,
    );
    await queryRunner.query(
      `ALTER TABLE iam.departments
         ADD CONSTRAINT chk_departments_not_self_parent CHECK (parent_id IS NULL OR parent_id <> id)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_departments_parent_id ON iam.departments (parent_id)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS iam.idx_departments_parent_id`);
    await queryRunner.query(
      `ALTER TABLE iam.departments DROP CONSTRAINT IF EXISTS chk_departments_not_self_parent`,
    );
    await queryRunner.query(
      `ALTER TABLE iam.departments DROP CONSTRAINT IF EXISTS fk_departments_parent`,
    );
    await queryRunner.query(`ALTER TABLE iam.departments DROP COLUMN IF EXISTS parent_id`);
  }
}
