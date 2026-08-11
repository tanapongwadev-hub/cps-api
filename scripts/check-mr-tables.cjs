/**
 * Diagnostic script — check if Materials Receiving tables exist and have data.
 * Run: node scripts/check-mr-tables.cjs
 */
require("dotenv").config();
const { Client } = require("pg");

const config = {
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USERNAME || "postgres",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_DATABASE || "cps_database",
};

const queries = [
  // 1. List all schemas
  `SELECT schema_name FROM information_schema.schemata WHERE schema_name IN ('iam', 'master', 'inventory') ORDER BY schema_name`,

  // 2. List Materials Receiving tables
  `SELECT table_schema, table_name
   FROM information_schema.tables
   WHERE table_name IN ('material_receivings', 'material_receiving_packages', 'stock_balances', 'stock_transactions')
   ORDER BY table_schema, table_name`,

  // 3. Count rows
  `SELECT 'material_receivings' as t, COUNT(*) as rows FROM inventory.material_receivings
   UNION ALL SELECT 'material_receiving_packages', COUNT(*) FROM inventory.material_receiving_packages
   UNION ALL SELECT 'stock_balances', COUNT(*) FROM inventory.stock_balances`,

  // 4. Show all data
  `SELECT id, internal_lot_no, status, receive_quantity, package_count, created_at
   FROM inventory.material_receivings
   ORDER BY created_at DESC
   LIMIT 5`,

  // 5. Show packages for any receiving
  `SELECT material_receiving_id, COUNT(*) as pkg_count
   FROM inventory.material_receiving_packages
   GROUP BY material_receiving_id`,
];

(async () => {
  const client = new Client(config);
  try {
    await client.connect();
    console.log("=== 1. Schemas ===");
    const r1 = await client.query(queries[0]);
    r1.rows.forEach((r) => console.log("  -", r.schema_name));

    console.log("\n=== 2. Materials Receiving tables ===");
    const r2 = await client.query(queries[1]);
    if (r2.rows.length === 0) {
      console.log("  ❌ NO TABLES FOUND — migration not run yet!");
    } else {
      r2.rows.forEach((r) => console.log("  -", r.table_schema + "." + r.table_name));
    }

    console.log("\n=== 3. Row counts ===");
    const r3 = await client.query(queries[2]);
    r3.rows.forEach((r) => console.log(`  ${r.t}: ${r.rows} rows`));

    console.log("\n=== 4. Recent material_receivings ===");
    const r4 = await client.query(queries[3]);
    if (r4.rows.length === 0) {
      console.log("  (no rows)");
    } else {
      r4.rows.forEach((r) => console.log(" ", r));
    }

    console.log("\n=== 5. Packages by receiving ===");
    const r5 = await client.query(queries[4]);
    if (r5.rows.length === 0) {
      console.log("  (no packages)");
    } else {
      r5.rows.forEach((r) => console.log(" ", r));
    }
  } catch (e) {
    console.error("ERR:", e.message);
  } finally {
    await client.end();
  }
})();
