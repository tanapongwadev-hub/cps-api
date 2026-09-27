import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the v1 Activity Event envelope without rewriting or discarding legacy
 * audit evidence. Existing rows are explicitly identified as a migration
 * backfill and retain their original created/trace timestamps.
 */
export class AddActivityEventEnvelope1790500000000
  implements MigrationInterface
{
  name = 'AddActivityEventEnvelope1790500000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE iam.audit_logs
        ADD COLUMN IF NOT EXISTS event_id VARCHAR(64),
        ADD COLUMN IF NOT EXISTS event_name VARCHAR(120),
        ADD COLUMN IF NOT EXISTS schema_version INTEGER NOT NULL DEFAULT 1,
        ADD COLUMN IF NOT EXISTS stream VARCHAR(20) NOT NULL DEFAULT 'audit',
        ADD COLUMN IF NOT EXISTS outcome VARCHAR(32) NOT NULL DEFAULT 'SUCCESS',
        ADD COLUMN IF NOT EXISTS correlation_id VARCHAR(128),
        ADD COLUMN IF NOT EXISTS occurred_at TIMESTAMP
    `);
    await queryRunner.query(`
      UPDATE iam.audit_logs
      SET
        event_id = COALESCE(event_id, 'legacy-' || id::text),
        event_name = COALESCE(
          event_name,
          CASE target_type
            WHEN 'MATERIAL_RECEIVING' THEN 'material_receiving.'
            WHEN 'MATERIALS_DISBURSEMENT' THEN 'material_disbursement.'
            WHEN 'PRODUCTION_PLAN' THEN 'production_plan.'
            WHEN 'MATERIAL_JOB_ORDER' THEN 'material_job_order.'
            WHEN 'STOCK_MOVEMENT' THEN 'inventory.stock.'
            WHEN 'QR' THEN 'inventory.qr.'
            ELSE 'legacy.audit.'
          END || CASE action
            WHEN 'CREATE' THEN 'created'
            WHEN 'UPDATE' THEN 'updated'
            WHEN 'DELETE' THEN 'deleted'
            WHEN 'CANCEL' THEN 'cancelled'
            WHEN 'APPROVE' THEN 'approved'
            WHEN 'REOPEN' THEN 'reopened'
            WHEN 'STATUS_CHANGE' THEN 'status_changed'
            WHEN 'RESERVE' THEN 'reservation_created'
            WHEN 'RELEASE' THEN 'reservation_released'
            WHEN 'PRINT' THEN 'printed'
            WHEN 'PICK' THEN 'picked'
            WHEN 'ISSUE' THEN 'issued'
            WHEN 'COMPLETE' THEN 'completed'
            ELSE lower(action)
          END
        ),
        correlation_id = COALESCE(correlation_id, trace_id),
        occurred_at = COALESCE(occurred_at, created_at)
    `);
    await queryRunner.query(`
      ALTER TABLE iam.audit_logs
        ALTER COLUMN event_id SET NOT NULL,
        ALTER COLUMN event_name SET NOT NULL,
        ALTER COLUMN occurred_at SET NOT NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_audit_logs_event_id
        ON iam.audit_logs(event_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_correlation_created
        ON iam.audit_logs(correlation_id, created_at DESC)
        WHERE correlation_id IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_target_created
        ON iam.audit_logs(target_type, target_id, created_at DESC)
        WHERE target_type IS NOT NULL AND target_id IS NOT NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS iam.idx_audit_logs_target_created
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS iam.idx_audit_logs_correlation_created
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS iam.uq_audit_logs_event_id
    `);
    await queryRunner.query(`
      ALTER TABLE iam.audit_logs
        DROP COLUMN IF EXISTS occurred_at,
        DROP COLUMN IF EXISTS correlation_id,
        DROP COLUMN IF EXISTS outcome,
        DROP COLUMN IF EXISTS stream,
        DROP COLUMN IF EXISTS schema_version,
        DROP COLUMN IF EXISTS event_name,
        DROP COLUMN IF EXISTS event_id
    `);
  }
}
