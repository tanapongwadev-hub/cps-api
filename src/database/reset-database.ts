// `dotenv/config` must come first — getDatabaseConfig() reads DB_PASSWORD via
// getEnv() with no default, so it throws unless .env is already loaded. The
// migration data-source does the same (see data-source.ts).
import 'dotenv/config';
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { getDatabaseConfig } from '../config/database.config';
import { getAppConfig } from '../config/app.config';

/**
 * Drops and recreates every schema this application owns, giving a completely
 * empty database with all identity sequences back at 1.
 *
 * Why all three schemas and not just DB_SCHEMA:
 *   The app spreads its tables across `iam` (DB_SCHEMA), `master` and
 *   `inventory`. Dropping only `iam` wipes the `iam.migrations` bookkeeping
 *   table while leaving `master`/`inventory` tables in place, so the next
 *   `migration:run` replays from zero and dies on `CREATE TABLE master.units`
 *   ("relation already exists").
 *
 * Why the schemas are recreated here:
 *   `iam` and `master` are created by their own migrations
 *   (CreateIamSchema, CreateMaterialMaster / CreateAdditionalMasterTables use
 *   IF NOT EXISTS), but *no migration creates `inventory`* — it was introduced
 *   by CreateGoodsReceipt1700000000008, whose file no longer exists in the
 *   repo. Without pre-creating it, `migration:run` fails at
 *   CreateMaterialsReceiving1786197666076. Creating all of them here is
 *   idempotent with those migrations and keeps the outcome predictable.
 *
 * After running this:
 *   pnpm migration:run   # rebuild the schema
 *   pnpm seed:run        # roles, actions, menus, permissions, super admin
 */
async function resetDatabase() {
  const { nodeEnv } = getAppConfig();
  if (nodeEnv === 'production') {
    console.error('Database reset is not allowed in production');
    process.exit(1);
  }

  const config = getDatabaseConfig();

  // DB_SCHEMA first so a non-default value is still handled, then the two
  // schemas the entities hardcode. Deduplicated in case DB_SCHEMA is one of them.
  const schemas = [...new Set([config.schema, 'master', 'inventory'])];

  const dataSource = new DataSource({ ...config, logging: true });

  try {
    await dataSource.initialize();
    console.log(
      `Connected to ${config.database} at ${config.host}:${config.port}`,
    );

    const queryRunner = dataSource.createQueryRunner();

    try {
      // Report the blast radius before destroying anything, so the console log
      // is a record of what this run actually removed.
      const counts = await queryRunner.query(
        `SELECT table_schema, COUNT(*)::int AS tables
           FROM information_schema.tables
          WHERE table_type = 'BASE TABLE'
            AND table_schema = ANY($1)
          GROUP BY table_schema
          ORDER BY table_schema`,
        [schemas],
      );
      if (counts.length === 0) {
        console.log('No existing tables found in: ' + schemas.join(', '));
      } else {
        console.log('About to drop:');
        for (const row of counts) {
          console.log(`  ${row.table_schema}: ${row.tables} table(s)`);
        }
      }

      for (const schema of schemas) {
        console.log(`Dropping schema: ${schema}`);
        await queryRunner.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      }

      for (const schema of schemas) {
        console.log(`Creating schema: ${schema}`);
        await queryRunner.query(`CREATE SCHEMA "${schema}"`);
      }
    } finally {
      await queryRunner.release();
    }

    console.log('Database reset completed successfully');
    console.log('Next: pnpm migration:run && pnpm seed:run');
  } catch (error) {
    console.error('Error resetting database:', error);
    process.exit(1);
  } finally {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  }
}

resetDatabase();
