const { Client } = require('pg');

async function main() {
  const client = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: '9203106',
    database: 'cps_database',
  });

  await client.connect();
  await client.query(`
    ALTER TABLE inventory.stock_transactions
    DROP CONSTRAINT chk_stock_transactions_ref_type,
    ADD CONSTRAINT chk_stock_transactions_ref_type
    CHECK (reference_type IN ('MATERIAL_RECEIVING', 'MATERIALS_DISBURSEMENT'))
  `);
  console.log('Constraint updated OK');
  await client.end();
}

main().catch(e => { console.error(e.message); process.exit(1); });
