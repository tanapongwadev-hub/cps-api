const { Client } = require('pg');
const c = new Client({
  host: 'localhost',
  port: 5432,
  database: 'cps_database',
  user: 'postgres',
  password: '9203106',
});
c.connect()
  .then(() => c.query(`
    SELECT
      m.code,
      m.name_th,
      m.path,
      m.sort_order,
      m.is_visible,
      m.is_active,
      m.menu_type,
      p.name_th as parent_name
    FROM iam.menus m
    LEFT JOIN iam.menus p ON p.id = m.parent_id
    WHERE m.is_visible = true AND m.is_active = true
    ORDER BY p.sort_order NULLS FIRST, m.sort_order
  `))
  .then((r) => {
    console.log(JSON.stringify(r.rows, null, 2));
    c.end();
  })
  .catch((e) => {
    console.error(e);
    c.end();
  });
