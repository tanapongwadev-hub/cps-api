const { Client } = require('pg');
const c = new Client({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: '9203106',
  database: 'cps_database',
});
c.connect()
  .then(async () => {
    const tables = ['categories', 'units', 'materials', 'products', 'product_boms', 'product_bom_items'];
    for (const t of tables) {
      const r = await c.query(
        `SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema='master' AND table_name=$1 ORDER BY ordinal_position`,
        [t],
      );
      console.log(`\n=== ${t} ===`);
      if (r.rows.length === 0) {
        console.log('  (table does not exist)');
      } else {
        r.rows.forEach((row) => console.log(`  - ${row.column_name}: ${row.data_type} ${row.is_nullable === 'NO' ? 'NOT NULL' : ''}`));
      }
    }
    c.end();
  })
  .catch((e) => {
    console.error('Error:', e.message);
    process.exit(1);
  });
