import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserAssignmentUniqueness1700000000004
  implements MigrationInterface
{
  name = 'AddUserAssignmentUniqueness1700000000004';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM iam.user_department_roles
          GROUP BY user_id, department_id, role_id
          HAVING COUNT(*) > 1
        ) THEN
          RAISE EXCEPTION 'Duplicate user assignment pairs exist; resolve them before migration';
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      ALTER TABLE iam.user_department_roles
      ADD CONSTRAINT uq_user_department_roles_user_department_role
      UNIQUE (user_id, department_id, role_id)
      DEFERRABLE INITIALLY DEFERRED
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_user_department_roles_user_system_role
      ON iam.user_department_roles (user_id, role_id)
      WHERE department_id IS NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS iam.uq_user_department_roles_user_system_role
    `);
    await queryRunner.query(`
      ALTER TABLE iam.user_department_roles
      DROP CONSTRAINT IF EXISTS uq_user_department_roles_user_department_role
    `);
  }
}
