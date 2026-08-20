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
      mr.internal_lot_no,
      mr.receive_date,
      mr.receive_quantity,
      m.code AS material_code,
      m.name AS material_name,
      mr.status
    FROM inventory.material_receivings mr
    LEFT JOIN master.materials m ON m.id = mr.material_id
    ORDER BY mr.receive_date DESC
    LIMIT 10
  `))
  .then((r) => {
    console.log('Receivings:');
    console.log(JSON.stringify(r.rows, null, 2));
    return c.query(`
      SELECT
        md.disbursement_no,
        md.disbursement_date,
        md.status,
        COUNT(mdi.id) AS item_count
      FROM inventory.materials_disbursements md
      LEFT JOIN inventory.material_disbursement_items mdi ON mdi.disbursement_id = md.id
      GROUP BY md.id, md.disbursement_no, md.disbursement_date, md.status
      ORDER BY md.disbursement_date DESC
      LIMIT 10
    `);
  })
  .then((r) => {
    console.log('\nDisbursements:');
    console.log(JSON.stringify(r.rows, null, 2));
    c.end();
  })
  .catch((e) => {
    console.error(e);
    c.end();
  });
