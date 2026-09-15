/**
 * Provision a fresh application database from nothing: create the database,
 * create the schemas, run every migration, optionally seed.
 *
 * Usage:
 *   node scripts/provision-database.cjs                      # creates cps_db
 *   node scripts/provision-database.cjs --database my_db     # different name
 *   node scripts/provision-database.cjs --seed               # + roles/menus/super admin
 *   node scripts/provision-database.cjs --force              # DROP an existing target first
 *
 * Credentials come from .env (the same file data-source.ts reads), except
 * DB_DATABASE, which this script overrides with the target name.
 */
const path = require('path');
const { spawnSync } = require('child_process');
const { Client } = require('pg');

const ROOT = path.resolve(__dirname, '..');

require('dotenv').config({ path: path.join(ROOT, '.env'), quiet: true });

const args = process.argv.slice(2);
const flagValue = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};

const TARGET_DB = flagValue('--database', 'cps_db');
const FORCE = args.includes('--force');
const SEED = args.includes('--seed');

// The app spreads its tables across three schemas. `iam` and `master` are
// created by their own migrations, but nothing creates `inventory` — the
// migration that introduced it is no longer in the repo — so migration:run
// dies at CreateMaterialsReceiving unless it already exists.
const SCHEMAS = [process.env.DB_SCHEMA || 'iam', 'master', 'inventory'];

const connection = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
};

// shell: true so `pnpm` resolves to pnpm.cmd on Windows. The command is passed
// as one string because Node deprecates (and does not escape) an args array
// under a shell; every command here is a hardcoded constant, never user input.
const run = (label, command) => {
  console.log(`\n▶ ${label}`);
  const result = spawnSync(command, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      DB_HOST: connection.host,
      DB_PORT: String(connection.port),
      DB_USERNAME: connection.user,
      DB_PASSWORD: connection.password,
      DB_DATABASE: TARGET_DB,
    },
  });
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status}`);
  }
};

async function createDatabase() {
  const admin = new Client({ ...connection, database: 'postgres' });
  await admin.connect();

  try {
    const quoted = admin.escapeIdentifier(TARGET_DB);
    const { rowCount } = await admin.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [TARGET_DB],
    );

    if (rowCount && !FORCE) {
      console.log(`Database ${TARGET_DB} already exists — reusing it.`);
      return;
    }

    if (rowCount) {
      console.log(`Dropping existing database ${TARGET_DB} (--force)...`);
      // Postgres refuses DROP DATABASE while sessions are attached.
      await admin.query(
        'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
        [TARGET_DB],
      );
      await admin.query(`DROP DATABASE ${quoted}`);
    }

    console.log(`Creating database ${TARGET_DB}...`);
    await admin.query(
      `CREATE DATABASE ${quoted} OWNER ${admin.escapeIdentifier(connection.user)}`,
    );
  } finally {
    await admin.end();
  }
}

async function createSchemas() {
  const client = new Client({ ...connection, database: TARGET_DB });
  await client.connect();

  try {
    for (const schema of new Set(SCHEMAS)) {
      console.log(`Creating schema ${schema}...`);
      await client.query(
        `CREATE SCHEMA IF NOT EXISTS ${client.escapeIdentifier(schema)}`,
      );
    }
  } finally {
    await client.end();
  }
}

async function report() {
  const client = new Client({ ...connection, database: TARGET_DB });
  await client.connect();

  try {
    const { rows } = await client.query(`
      SELECT table_schema AS schema, COUNT(*)::int AS tables
        FROM information_schema.tables
       WHERE table_type = 'BASE TABLE'
         AND table_schema NOT IN ('pg_catalog', 'information_schema')
       GROUP BY table_schema
       ORDER BY table_schema
    `);
    const { rows: seq } = await client.query(
      `SELECT COUNT(*)::int AS sequences FROM pg_class WHERE relkind = 'S'`,
    );

    console.log(`\n=== ${TARGET_DB} ===`);
    console.table(rows);
    console.log(`sequences: ${seq[0].sequences}`);
  } finally {
    await client.end();
  }
}

async function main() {
  if (!connection.user || !connection.password) {
    throw new Error('DB_USERNAME and DB_PASSWORD must be set in .env');
  }

  console.log(
    `Provisioning ${TARGET_DB} on ${connection.host}:${connection.port} as ${connection.user}`,
  );

  await createDatabase();
  await createSchemas();

  run('migration:run', 'pnpm migration:run');

  if (SEED) {
    run('seed:run', 'pnpm seed:run');
    // Seeds insert rows with explicit ids, which leaves the sequences behind
    // the data and makes the next app INSERT collide on the primary key.
    run('sequence sync', 'node scripts/fix-sequences.cjs --fix');
  }

  await report();

  console.log(
    `\nDone. Point the app at it by setting DB_DATABASE=${TARGET_DB} in .env`,
  );
}

main().catch((e) => {
  console.error(`\n${e.message}`);
  process.exit(1);
});
