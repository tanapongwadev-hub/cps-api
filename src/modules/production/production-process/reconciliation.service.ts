import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface ReconciliationIssue {
  check: string;
  ref: string;
  expected: number;
  actual: number;
}

/**
 * Ledger sum of the given movement types matching `where`, netted by the
 * REVERSAL rows that take them back (a reversal row's own type is REVERSAL;
 * its original's type says what it undoes).
 */
const netSum = (where: string, types: string) => `
  COALESCE((SELECT SUM(t.qty)
            FROM inventory.production_transactions t
            LEFT JOIN inventory.production_transactions o ON o.id = t.reverses_transaction_id
            WHERE ${where}
              AND (t.transaction_type IN (${types})
                   OR (t.transaction_type = 'REVERSAL' AND o.transaction_type IN (${types})))), 0)`;

/**
 * Read-only consistency check of one order line (plan §11.7). Every state
 * table is a projection of the append-only ledger, and every quantity carries
 * a materialized origin breakdown; this recomputes both sides and lists every
 * place they disagree. An empty `issues` list means the line reconciles.
 */
@Injectable()
export class ReconciliationService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async reconcile(lineId: string) {
    const exists = await this.dataSource.query<unknown[]>(
      `SELECT 1 FROM inventory.production_order_lines WHERE id = $1`,
      [lineId],
    );
    if (!exists.length) {
      throw new NotFoundException(`ไม่พบรายการสั่งผลิต id ${lineId}`);
    }

    const checks: Array<[string, string]> = [
      [
        'lot.produced = SUM(origins.qty)',
        `SELECT l.lot_no AS ref, l.produced_qty AS expected, COALESCE(SUM(o.qty), 0)::int AS actual
         FROM inventory.production_lots l
         LEFT JOIN inventory.production_lot_origins o ON o.lot_id = l.id
         WHERE l.production_order_line_id = $1
         GROUP BY l.id HAVING l.produced_qty <> COALESCE(SUM(o.qty), 0)`,
      ],
      [
        'lot.remaining = SUM(origins.qty_remaining)',
        `SELECT l.lot_no AS ref, l.remaining_qty AS expected, COALESCE(SUM(o.qty_remaining), 0)::int AS actual
         FROM inventory.production_lots l
         LEFT JOIN inventory.production_lot_origins o ON o.lot_id = l.id
         WHERE l.production_order_line_id = $1
         GROUP BY l.id HAVING l.remaining_qty <> COALESCE(SUM(o.qty_remaining), 0)`,
      ],
      [
        'lot.produced = ledger output',
        `SELECT l.lot_no AS ref, l.produced_qty AS expected, COALESCE(SUM(t.qty), 0)::int AS actual
         FROM inventory.production_lots l
         LEFT JOIN inventory.production_transactions t
           ON t.target_lot_id = l.id
          AND t.transaction_type IN ('PROCESS_OUTPUT','FG_RECEIVE','REVERSAL')
         WHERE l.production_order_line_id = $1
         GROUP BY l.id HAVING l.produced_qty <> COALESCE(SUM(t.qty), 0)`,
      ],
      [
        'lot.remaining = produced − transferred − packed',
        `SELECT * FROM (
           SELECT l.lot_no AS ref, l.remaining_qty AS expected,
                  (l.produced_qty - ${netSum('t.source_lot_id = l.id', `'TRANSFER','PACKING'`)})::int AS actual
           FROM inventory.production_lots l
           WHERE l.production_order_line_id = $1) x
         WHERE expected <> actual`,
      ],
      [
        'wip.remaining = SUM(origins.qty_remaining)',
        `SELECT w.id::text AS ref, w.qty_remaining AS expected, COALESCE(SUM(o.qty_remaining), 0)::int AS actual
         FROM inventory.process_wip w
         LEFT JOIN inventory.process_wip_origins o ON o.wip_id = w.id
         WHERE w.production_order_line_id = $1 AND w.source_lot_id IS NOT NULL
         GROUP BY w.id HAVING w.qty_remaining <> COALESCE(SUM(o.qty_remaining), 0)`,
      ],
      [
        'wip.used = ledger output',
        `SELECT * FROM (
           SELECT w.id::text AS ref, w.qty_used AS expected,
                  ${netSum('t.source_wip_id = w.id', `'PROCESS_OUTPUT','FG_RECEIVE'`)}::int AS actual
           FROM inventory.process_wip w
           WHERE w.production_order_line_id = $1) x
         WHERE expected <> actual`,
      ],
      [
        'wip.rejected = ledger rejects',
        `SELECT * FROM (
           SELECT w.id::text AS ref, w.qty_rejected AS expected,
                  ${netSum('t.source_wip_id = w.id', `'REJECT'`)}::int AS actual
           FROM inventory.process_wip w
           WHERE w.production_order_line_id = $1) x
         WHERE expected <> actual`,
      ],
      [
        'package.initial = SUM(package_sources.qty)',
        `SELECT p.qr_code AS ref, p.initial_qty AS expected, COALESCE(SUM(s.qty), 0)::int AS actual
         FROM inventory.production_packages p
         LEFT JOIN inventory.production_package_sources s ON s.package_id = p.id
         WHERE p.production_order_line_id = $1
         GROUP BY p.id HAVING p.initial_qty <> COALESCE(SUM(s.qty), 0)`,
      ],
      [
        'line counters = lots / WIP',
        `WITH c AS (
           SELECT
             (SELECT COALESCE(SUM(produced_qty), 0) FROM inventory.production_lots
               WHERE production_order_line_id = $1 AND lot_type = 'ORIGIN')::int AS produced,
             (SELECT COALESCE(SUM(produced_qty), 0) FROM inventory.production_lots
               WHERE production_order_line_id = $1 AND lot_type IN ('FG','STORE'))::int AS received,
             (SELECT COALESCE(SUM(qty_rejected), 0) FROM inventory.process_wip
               WHERE production_order_line_id = $1)::int AS rejected)
         SELECT x.ref, x.expected, x.actual FROM inventory.production_order_lines l, c,
           LATERAL (VALUES ('produced_qty', l.produced_qty, c.produced),
                           ('received_qty', l.received_qty, c.received),
                           ('rejected_qty', l.rejected_qty, c.rejected)) AS x(ref, expected, actual)
         WHERE l.id = $1 AND x.expected <> x.actual`,
      ],
    ];

    const issues: ReconciliationIssue[] = [];
    for (const [check, sql] of checks) {
      const rows = await this.dataSource.query<
        Array<{ ref: string; expected: number; actual: number }>
      >(sql, [lineId]);
      for (const r of rows) {
        issues.push({
          check,
          ref: String(r.ref),
          expected: Number(r.expected),
          actual: Number(r.actual),
        });
      }
    }
    return {
      lineId,
      checkedAt: new Date().toISOString(),
      checks: checks.length,
      ok: issues.length === 0,
      issues,
    };
  }
}
