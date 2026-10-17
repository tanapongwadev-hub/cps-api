import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

export const MATERIALS_DASHBOARD_MAX_DAYS = 366;

export interface MaterialsDashboardAccess {
  receiving: boolean;
  disbursement: boolean;
}

export interface MaterialsDashboardRange {
  from: string;
  to: string;
}

type Row = Record<string, string | number | null>;

// Confirmed documents only count towards quantities; cancelled ones are
// reported separately. Quantities of different units are summed as plain
// numbers (same convention as the stock dashboards) — the lists show the unit.
@Injectable()
export class MaterialsDashboardService {
  constructor(private readonly dataSource: DataSource) {}

  async getOverview(
    range: MaterialsDashboardRange,
    access: MaterialsDashboardAccess,
  ) {
    const { from, to } = range;
    const q = (sql: string) =>
      this.dataSource.query(sql, [from, to]) as Promise<Row[]>;
    const none = Promise.resolve([] as Row[]);

    const [
      receivingDaily,
      disbursementDaily,
      topReceived,
      topDisbursed,
      bySupplier,
      byType,
      recentReceivings,
      recentDisbursements,
      receivingStatus,
      disbursementStatus,
    ] = await Promise.all([
      access.receiving
        ? q(
            `SELECT to_char(receive_date, 'YYYY-MM-DD') AS date, COUNT(*)::int AS docs,
                    COALESCE(SUM(receive_quantity), 0)::float8 AS qty
             FROM inventory.material_receivings
             WHERE status = 'confirmed' AND receive_date BETWEEN $1 AND $2
             GROUP BY receive_date`,
          )
        : none,
      access.disbursement
        ? q(
            `SELECT to_char(d.disbursement_date, 'YYYY-MM-DD') AS date, COUNT(DISTINCT d.id)::int AS docs,
                    COALESCE(SUM(i.disbursed_quantity), 0)::float8 AS qty
             FROM inventory.materials_disbursements d
             LEFT JOIN inventory.material_disbursement_items i ON i.disbursement_id = d.id
             WHERE d.status = 'confirmed' AND d.disbursement_date BETWEEN $1 AND $2
             GROUP BY d.disbursement_date`,
          )
        : none,
      access.receiving
        ? q(
            `SELECT m.code, m.name, u.symbol AS unit, SUM(r.receive_quantity)::float8 AS qty, COUNT(*)::int AS docs
             FROM inventory.material_receivings r
             JOIN master.materials m ON m.id = r.material_id
             LEFT JOIN master.units u ON u.id = r.unit_id
             WHERE r.status = 'confirmed' AND r.receive_date BETWEEN $1 AND $2
             GROUP BY m.code, m.name, u.symbol ORDER BY qty DESC LIMIT 8`,
          )
        : none,
      access.disbursement
        ? q(
            `SELECT m.code, m.name, u.symbol AS unit, SUM(i.disbursed_quantity)::float8 AS qty, COUNT(DISTINCT d.id)::int AS docs
             FROM inventory.materials_disbursements d
             JOIN inventory.material_disbursement_items i ON i.disbursement_id = d.id
             JOIN master.materials m ON m.id = i.material_id
             LEFT JOIN master.units u ON u.id = m.unit_id
             WHERE d.status = 'confirmed' AND d.disbursement_date BETWEEN $1 AND $2
             GROUP BY m.code, m.name, u.symbol ORDER BY qty DESC LIMIT 8`,
          )
        : none,
      access.receiving
        ? q(
            `SELECT COALESCE(s.name_th, 'ไม่ระบุผู้จัดจำหน่าย') AS name, SUM(r.receive_quantity)::float8 AS qty, COUNT(*)::int AS docs
             FROM inventory.material_receivings r
             LEFT JOIN master.suppliers s ON s.id = r.supplier_id
             WHERE r.status = 'confirmed' AND r.receive_date BETWEEN $1 AND $2
             GROUP BY 1 ORDER BY qty DESC LIMIT 6`,
          )
        : none,
      access.disbursement
        ? q(
            `SELECT d.disbursement_type AS type, COUNT(DISTINCT d.id)::int AS docs,
                    COALESCE(SUM(i.disbursed_quantity), 0)::float8 AS qty
             FROM inventory.materials_disbursements d
             LEFT JOIN inventory.material_disbursement_items i ON i.disbursement_id = d.id
             WHERE d.status = 'confirmed' AND d.disbursement_date BETWEEN $1 AND $2
             GROUP BY d.disbursement_type ORDER BY qty DESC`,
          )
        : none,
      access.receiving
        ? q(
            `SELECT r.id::text AS id, r.internal_lot_no AS "lotNo", m.code AS "materialCode", m.name AS "materialName",
                    r.receive_quantity::float8 AS qty, u.symbol AS unit, s.name_th AS supplier,
                    to_char(r.receive_date, 'YYYY-MM-DD') AS date
             FROM inventory.material_receivings r
             JOIN master.materials m ON m.id = r.material_id
             LEFT JOIN master.units u ON u.id = r.unit_id
             LEFT JOIN master.suppliers s ON s.id = r.supplier_id
             WHERE r.status = 'confirmed' AND r.receive_date BETWEEN $1 AND $2
             ORDER BY r.receive_date DESC, r.id DESC LIMIT 8`,
          )
        : none,
      access.disbursement
        ? q(
            `SELECT d.id::text AS id, d.disbursement_no AS "documentNo", d.disbursement_type AS type,
                    to_char(d.disbursement_date, 'YYYY-MM-DD') AS date,
                    COUNT(i.id)::int AS items, COALESCE(SUM(i.disbursed_quantity), 0)::float8 AS qty,
                    MIN(m.code) AS "firstMaterial"
             FROM inventory.materials_disbursements d
             LEFT JOIN inventory.material_disbursement_items i ON i.disbursement_id = d.id
             LEFT JOIN master.materials m ON m.id = i.material_id
             WHERE d.status = 'confirmed' AND d.disbursement_date BETWEEN $1 AND $2
             GROUP BY d.id ORDER BY d.disbursement_date DESC, d.id DESC LIMIT 8`,
          )
        : none,
      access.receiving
        ? q(
            `SELECT status, COUNT(*)::int AS count FROM inventory.material_receivings
             WHERE receive_date BETWEEN $1 AND $2 GROUP BY status`,
          )
        : none,
      access.disbursement
        ? q(
            `SELECT status, COUNT(*)::int AS count FROM inventory.materials_disbursements
             WHERE disbursement_date BETWEEN $1 AND $2 GROUP BY status`,
          )
        : none,
    ]);

    // Zero-filled day series so the chart never skips a day.
    const recv = new Map(receivingDaily.map((r) => [String(r.date), r]));
    const disb = new Map(disbursementDaily.map((r) => [String(r.date), r]));
    const daily: Array<{
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
      daily.push({
        date,
        receivedQty: Number(recv.get(date)?.qty ?? 0),
        receivedDocs: Number(recv.get(date)?.docs ?? 0),
        disbursedQty: Number(disb.get(date)?.qty ?? 0),
        disbursedDocs: Number(disb.get(date)?.docs ?? 0),
      });
    }
    const sum = (
      key: 'receivedQty' | 'receivedDocs' | 'disbursedQty' | 'disbursedDocs',
    ) => daily.reduce((total, d) => total + d[key], 0);
    const count = (rows: Row[], status: string) =>
      Number(rows.find((r) => r.status === status)?.count ?? 0);

    return {
      range: { from, to, days: daily.length },
      access,
      totals: {
        receivedQty: sum('receivedQty'),
        receivedDocs: sum('receivedDocs'),
        disbursedQty: sum('disbursedQty'),
        disbursedDocs: sum('disbursedDocs'),
        receivingCancelled: count(receivingStatus, 'cancelled'),
        receivingDraft: count(receivingStatus, 'draft'),
        disbursementCancelled: count(disbursementStatus, 'cancelled'),
        disbursementDraft: count(disbursementStatus, 'draft'),
      },
      daily,
      topReceived,
      topDisbursed,
      bySupplier,
      byDisbursementType: byType,
      recentReceivings,
      recentDisbursements,
    };
  }
}
