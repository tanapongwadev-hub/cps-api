import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRefreshRotation1789800000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE iam.auth_sessions
        ADD COLUMN IF NOT EXISTS previous_refresh_token_hash VARCHAR(255),
        ADD COLUMN IF NOT EXISTS refresh_grace_until TIMESTAMP,
        ADD COLUMN IF NOT EXISTS refresh_claims JSONB,
        ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMP
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE iam.auth_sessions
        DROP COLUMN IF EXISTS previous_refresh_token_hash,
        DROP COLUMN IF EXISTS refresh_grace_until,
        DROP COLUMN IF EXISTS refresh_claims,
        DROP COLUMN IF EXISTS last_used_at
    `);
  }
}
