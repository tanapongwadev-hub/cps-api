import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

type Row = Record<string, string | number | null>;

// Finished-product stock movements (inventory.product_stock_movements) for a
// Bangkok-date range. `receive` rows come from FG packing or a manual receipt,
// `issue` rows from sales issue or a manual issue; the source is derived from
// the reference number prefix (QR-… box labels, DO-… delivery orders).
@Injectable()
export class ProductsDashboardService {
  constructor(private readonly dataSource: DataSource) {}

  /** Every receive / issue of one product in the range (newest first, max 500). */
  async getProductMovements(code: string, range: { from: string; to: string }) {
    const rows = (await this.dataSource.query(
      `SELECT m.id::text AS id, m.type, m.quantity::float8 AS qty, m.balance_after::float8 AS "balanceAfter",
              m.reference_no AS "referenceNo", m.remark,
              to_char(m.created_at AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD HH24:MI') AS "recordedAt",
              NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), '') AS "recordedBy",
              p.code AS "productCode", p.name AS "productName", un.symbol AS unit
       FROM inventory.product_stock_movements m
       JOIN master.products p ON p.id = m.product_id
       LEFT JOIN master.units un ON un.id = p.unit_id
       LEFT JOIN iam.users u ON u.id = m.recorded_by
       WHERE p.code = $1 AND (m.created_at AT TIME ZONE 'Asia/Bangkok')::date BETWEEN $2 AND $3
       ORDER BY m.id DESC LIMIT 501`,
      [code, range.from, range.to],
    )) as Row[];
    const truncated = rows.length > 500;
    const items = rows.slice(0, 500).map((r) => ({
      id: r.id, type: r.type, qty: Number(r.qty), balanceAfter: Number(r.balanceAfter),
      referenceNo: r.referenceNo, remark: r.remark, recordedAt: r.recordedAt, recordedBy: r.recordedBy,
    }));
    const sum = (type: string) => items.filter((i) => i.type === type).reduce((t, i) => t + i.qty, 0);
    return {
      product: rows[0] ? { code: rows[0].productCode, name: rows[0].productName, unit: rows[0].unit } : null,
      range,
      totals: { receivedQty: sum('receive'), issuedQty: sum('issue'), count: items.length },
      truncated,
      items,
    };
  }

  async getOverview(range: { from: string; to: string }) {
    const { from, to } = range;
    const day = `(m.created_at AT TIME ZONE 'Asia/Bangkok')::date`;
    const between = `${day} BETWEEN $1 AND $2`;
    const q = (sql: string, params: unknown[] = [from, to]) =>
      this.dataSource.query(sql, params) as Promise<Row[]>;

    const [
      daily,
      topReceived,
      topIssued,
      byCustomer,
      receiveSource,
      issueSource,
      recentReceives,
      recentIssues,
      stock,
      lowStock,
      byProduct,
    ] = await Promise.all([
      q(
        `SELECT to_char(${day}, 'YYYY-MM-DD') AS date, m.type,
                COUNT(*)::int AS docs, COALESCE(SUM(m.quantity), 0)::float8 AS qty
         FROM inventory.product_stock_movements m WHERE ${between} GROUP BY 1, 2`,
      ),
      q(
        `SELECT p.code, p.name, u.symbol AS unit, SUM(m.quantity)::float8 AS qty, COUNT(*)::int AS docs
         FROM inventory.product_stock_movements m
         JOIN master.products p ON p.id = m.product_id
         LEFT JOIN master.units u ON u.id = p.unit_id
         WHERE m.type = 'receive' AND ${between}
         GROUP BY p.code, p.name, u.symbol ORDER BY qty DESC LIMIT 8`,
      ),
      q(
        `SELECT p.code, p.name, u.symbol AS unit, SUM(m.quantity)::float8 AS qty, COUNT(*)::int AS docs
         FROM inventory.product_stock_movements m
         JOIN master.products p ON p.id = m.product_id
         LEFT JOIN master.units u ON u.id = p.unit_id
         WHERE m.type = 'issue' AND ${between}
         GROUP BY p.code, p.name, u.symbol ORDER BY qty DESC LIMIT 8`,
      ),
      q(
        `SELECT COALESCE(c.name_th, 'ไม่ระบุลูกค้า') AS name, SUM(m.quantity)::float8 AS qty, COUNT(*)::int AS docs
         FROM inventory.product_stock_movements m
         JOIN master.products p ON p.id = m.product_id
         LEFT JOIN master.customers c ON c.id = p.customer_id
         WHERE m.type = 'issue' AND ${between}
         GROUP BY 1 ORDER BY qty DESC LIMIT 6`,
      ),
      q(
        `SELECT CASE WHEN m.reference_no LIKE 'QR-%' THEN 'production' ELSE 'manual' END AS source,
                SUM(m.quantity)::float8 AS qty, COUNT(*)::int AS docs
         FROM inventory.product_stock_movements m WHERE m.type = 'receive' AND ${between} GROUP BY 1 ORDER BY qty DESC`,
      ),
      q(
        `SELECT CASE WHEN m.reference_no LIKE 'DO-%' THEN 'sales' ELSE 'manual' END AS source,
                SUM(m.quantity)::float8 AS qty, COUNT(*)::int AS docs
         FROM inventory.product_stock_movements m WHERE m.type = 'issue' AND ${between} GROUP BY 1 ORDER BY qty DESC`,
      ),
      q(
        `SELECT m.id::text AS id, p.code AS "productCode", p.name AS "productName", m.quantity::float8 AS qty,
                u.symbol AS unit, m.reference_no AS "referenceNo", to_char(${day}, 'YYYY-MM-DD') AS date
         FROM inventory.product_stock_movements m
         JOIN master.products p ON p.id = m.product_id
         LEFT JOIN master.units u ON u.id = p.unit_id
         WHERE m.type = 'receive' AND ${between} ORDER BY m.id DESC LIMIT 8`,
      ),
      q(
        `SELECT m.id::text AS id, p.code AS "productCode", p.name AS "productName", m.quantity::float8 AS qty,
                u.symbol AS unit, m.reference_no AS "referenceNo", to_char(${day}, 'YYYY-MM-DD') AS date
         FROM inventory.product_stock_movements m
         JOIN master.products p ON p.id = m.product_id
         LEFT JOIN master.units u ON u.id = p.unit_id
         WHERE m.type = 'issue' AND ${between} ORDER BY m.id DESC LIMIT 8`,
      ),
      q(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE bal <= 0)::int AS "outOfStock",
                COUNT(*) FILTER (WHERE bal > 0 AND bal < min_stock)::int AS "lowStock",
                COUNT(*) FILTER (WHERE bal > 0 AND bal >= min_stock)::int AS normal,
                COALESCE(SUM(bal), 0)::float8 AS "totalQty"
         FROM (
           SELECT p.min_stock::float8 AS min_stock, COALESCE(l.balance_after, 0)::float8 AS bal
           FROM master.products p
           LEFT JOIN LATERAL (
             SELECT balance_after FROM inventory.product_stock_movements s
             WHERE s.product_id = p.id ORDER BY s.id DESC LIMIT 1
           ) l ON true
           WHERE p.is_active
         ) x`,
        [],
      ),
      q(
        `SELECT p.code, p.name, u.symbol AS unit, COALESCE(l.balance_after, 0)::float8 AS balance,
                p.min_stock::float8 AS "minStock"
         FROM master.products p
         LEFT JOIN master.units u ON u.id = p.unit_id
         LEFT JOIN LATERAL (
           SELECT balance_after FROM inventory.product_stock_movements s
           WHERE s.product_id = p.id ORDER BY s.id DESC LIMIT 1
         ) l ON true
         WHERE p.is_active AND (COALESCE(l.balance_after, 0) <= 0 OR COALESCE(l.balance_after, 0) < p.min_stock)
         ORDER BY COALESCE(l.balance_after, 0) ASC, p.code LIMIT 8`,
        [],
      ),
      q(
        `SELECT p.code, p.name, u.symbol AS unit, p.min_stock::float8 AS "minStock",
                COALESCE(l.balance_after, 0)::float8 AS balance,
                COALESCE(a.rq, 0)::float8 AS "receivedQty", COALESCE(a.rd, 0)::int AS "receivedDocs",
                COALESCE(a.iq, 0)::float8 AS "issuedQty", COALESCE(a.id, 0)::int AS "issuedDocs"
         FROM master.products p
         LEFT JOIN master.units u ON u.id = p.unit_id
         LEFT JOIN LATERAL (
           SELECT balance_after FROM inventory.product_stock_movements s
           WHERE s.product_id = p.id ORDER BY s.id DESC LIMIT 1
         ) l ON true
         LEFT JOIN (
           SELECT m.product_id,
                  SUM(m.quantity) FILTER (WHERE m.type = 'receive') AS rq,
                  COUNT(*) FILTER (WHERE m.type = 'receive') AS rd,
                  SUM(m.quantity) FILTER (WHERE m.type = 'issue') AS iq,
                  COUNT(*) FILTER (WHERE m.type = 'issue') AS id
           FROM inventory.product_stock_movements m WHERE ${between} GROUP BY m.product_id
         ) a ON a.product_id = p.id
         WHERE p.is_active OR a.product_id IS NOT NULL
         ORDER BY (COALESCE(a.rq, 0) + COALESCE(a.iq, 0)) DESC, p.code LIMIT 500`,
      ),
    ]);

    // Zero-filled day series so the chart never skips a day.
    const key = (date: string, type: string) =>
      daily.find((r) => r.date === date && r.type === type);
    const series: Array<{
      date: string;
      receivedQty: number;
      receivedDocs: number;
      disbursedQty: number;
      disbursedDocs: number;
    }> = [];
    for (
      let t = Date.parse(`${from}T00:00:00Z`);
      t <= Date.parse(`${to}T00:00:00Z`);
      t += 86_400_000
    ) {
      const date = new Date(t).toISOString().slice(0, 10);
      series.push({
        date,
        receivedQty: Number(key(date, 'receive')?.qty ?? 0),
        receivedDocs: Number(key(date, 'receive')?.docs ?? 0),
        disbursedQty: Number(key(date, 'issue')?.qty ?? 0),
        disbursedDocs: Number(key(date, 'issue')?.docs ?? 0),
      });
    }
    const sum = (
      k: 'receivedQty' | 'receivedDocs' | 'disbursedQty' | 'disbursedDocs',
    ) => series.reduce((total, d) => total + d[k], 0);

    return {
      range: { from, to, days: series.length },
      totals: {
        receivedQty: sum('receivedQty'),
        receivedDocs: sum('receivedDocs'),
        disbursedQty: sum('disbursedQty'),
        disbursedDocs: sum('disbursedDocs'),
      },
      daily: series,
      topReceived,
      topIssued,
      byCustomer,
      receiveSource,
      issueSource,
      recentReceives,
      recentIssues,
      stock: stock[0] ?? { total: 0, outOfStock: 0, lowStock: 0, normal: 0, totalQty: 0 },
      lowStock,
      byProduct,
    };
  }
}
