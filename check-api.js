const { Client } = require('pg');
const c = new Client({
  host: 'localhost',
  port: 5432,
  database: 'cps_database',
  user: 'postgres',
  password: '9203106',
});
c.connect()
  // Simulate receiving query
  .then(() => c.query(`
    SELECT
      'receive' AS doc_type,
      mr.receive_date AS doc_date,
      mr.internal_lot_no AS doc_no,
      m.code AS material_code,
      m.name AS material_name,
      mr.material_type::TEXT AS material_type,
      COALESCE(u.symbol::TEXT, '') AS unit_symbol,
      mr.receive_quantity AS quantity_in,
      NULL::TEXT AS quantity_out,
      COALESCE(mr.supplier_production_date::TEXT, '') AS sub_label,
      NULL::TEXT AS source_lot_no,
      COALESCE(mr.po_no, '') AS po_no,
      COALESCE(s.name_th, '') AS supplier_name,
      mr.status,
      CASE mr.status
        WHEN 'draft' THEN 'ฉบับร่าง'
        WHEN 'confirmed' THEN 'ยืนยันแล้ว'
        WHEN 'cancelled' THEN 'ยกเลิก'
        ELSE mr.status
      END AS status_label
    FROM inventory.material_receivings mr
    LEFT JOIN master.materials m ON m.id = mr.material_id
    LEFT JOIN master.units u ON u.id = mr.unit_id
    LEFT JOIN master.suppliers s ON s.id = mr.supplier_id
    WHERE mr.receive_date >= '2026-07-31' AND mr.receive_date <= '2026-08-30'
    ORDER BY mr.receive_date DESC, mr.internal_lot_no DESC
    LIMIT 5
  `))
  .then((r) => {
    console.log('Keys in receiving row:', Object.keys(r.rows[0] || {}));
    console.log('First receiving row:', JSON.stringify(r.rows[0], null, 2));
    c.end();
  })
  .catch((e) => {
    console.error(e);
    c.end();
  });
