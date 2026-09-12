/**
 * Identity/serial sequence health check + repair.
 *
 * Symptom this fixes:
 *   duplicate key value violates unique constraint "<table>_pkey"
 *   detail: Key (id)=(1) already exists.
 *
 * Cause: the sequence backing an id column hands out a value that already exists in
 * the table. Happens when rows are loaded with explicit ids, or when a table's
 * identity is re-created (Postgres then makes a fresh `<table>_id_seq1` starting at 1
 * while the original `<table>_id_seq` keeps the real high-water mark).
 *
 * Usage:
 *   node scripts/fix-sequences.cjs         # report only, changes nothing
 *   node scripts/fix-sequences.cjs --fix   # setval() every out-of-sync sequence to MAX(id)
 *
 * The repair only moves counters forward and never touches row data.
 */
const path = require('path');
const { Client } = require('pg');

require('dotenv').config({
  path: path.resolve(__dirname, '..', '.env.local'),
  quiet: true,
});

const FIX = process.argv.includes('--fix');

const client = new Client({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
});

async function main() {
  await client.connect();

  const { rows: cols } = await client.query(`
    SELECT c.table_schema,
           c.table_name,
           c.column_name,
           pg_get_serial_sequence(format('%I.%I', c.table_schema, c.table_name), c.column_name) AS seq
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema NOT IN ('pg_catalog', 'information_schema')
      AND c.table_schema NOT LIKE 'pg_%'
      AND t.table_type = 'BASE TABLE'
      AND pg_get_serial_sequence(format('%I.%I', c.table_schema, c.table_name), c.column_name) IS NOT NULL
    ORDER BY c.table_schema, c.table_name, c.column_name
  `);

  const problems = [];
  let okCount = 0;

  for (const col of cols) {
    const qualifiedTable = `${client.escapeIdentifier(col.table_schema)}.${client.escapeIdentifier(col.table_name)}`;
    const quotedColumn = client.escapeIdentifier(col.column_name);

    const q = await client.query(
      `SELECT (SELECT COALESCE(MAX(${quotedColumn}), 0) FROM ${qualifiedTable}) AS max_id,
              (SELECT last_value FROM ${col.seq}) AS last_value,
              (SELECT is_called FROM ${col.seq}) AS is_called`,
    );

    const maxId = Number(q.rows[0].max_id);
    const lastValue = Number(q.rows[0].last_value);
    const isCalled = q.rows[0].is_called;
    // The value the next nextval() call will return.
    const nextVal = isCalled ? lastValue + 1 : lastValue;

    if (nextVal <= maxId) {
      problems.push({
        schema: col.table_schema,
        table: col.table_name,
        column: col.column_name,
        sequence: col.seq,
        max_id: maxId,
        would_hand_out: nextVal,
      });
    } else {
      okCount += 1;
    }
  }

  console.log(
    `Checked ${cols.length} sequence-backed columns across all user schemas.`,
  );
  console.log(`\n=== OUT OF SYNC (${problems.length}) ===`);
  if (problems.length) console.table(problems);
  console.log(`healthy: ${okCount}`);

  if (!problems.length) {
    await client.end();
    return;
  }

  if (!FIX) {
    console.log('\nRun with --fix to repair.');
    await client.end();
    return;
  }

  console.log('\nApplying setval() fixes...');
  for (const p of problems) {
    const qualifiedTable = `${client.escapeIdentifier(p.schema)}.${client.escapeIdentifier(p.table)}`;
    const quotedColumn = client.escapeIdentifier(p.column);
    // setval(seq, MAX(id), true) => the next nextval() returns MAX(id) + 1.
    const r = await client.query(
      `SELECT setval($1::regclass,
                     GREATEST((SELECT COALESCE(MAX(${quotedColumn}), 0) FROM ${qualifiedTable}), 1),
                     true) AS setval`,
      [p.sequence],
    );
    console.log(`  ${p.sequence} -> ${r.rows[0].setval}`);
  }
  console.log('\nDone. Re-run without --fix to verify.');

  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
