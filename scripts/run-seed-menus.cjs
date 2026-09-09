const { Client } = require('pg');
const fs = require('fs');

const client = new Client({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: '9203106',
  database: 'cps_database',
});

async function main() {
  await client.connect();
  const sql = fs.readFileSync(__dirname + '/seed-master-data-menus.sql', 'utf8');
  await client.query(sql);
  console.log('Done.');
  await client.end();
}

main().catch(e => { console.error(e.message); process.exit(1); });
