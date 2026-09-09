const { Client } = require('pg');
const client = new Client({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: '9203106',
  database: 'cps_database',
});
async function main() {
  await client.connect();
  const r = await client.query(`
    SELECT m.code, m.name_th, m.path, m.icon, m.sort_order,
           string_agg(p.code, ', ' ORDER BY p.code) as permissions
    FROM iam.menus m
    LEFT JOIN iam.permissions p ON p.menu_id = m.id
    WHERE m.code IN ('UNIT_MANAGEMENT','SUPPLIER_MANAGEMENT','MATERIAL_MODEL_MANAGEMENT')
    GROUP BY m.id, m.code, m.name_th, m.path, m.icon, m.sort_order
    ORDER BY m.sort_order
  `);
  console.log(JSON.stringify(r.rows, null, 2));
  await client.end();
}
main().catch(e => { console.error(e.message); process.exit(1); });
