import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export type HistoryKind = 'PRODUCE' | 'RECEIVE' | 'TRANSFER' | 'CLOSE' | 'PACK';

export interface HistoryEntry {
  requestId: string;
  kind: HistoryKind;
  stepIndex: number;
  stepCode: string;
  goodQty: number;
  rejectQty: number;
  closedQty: number;
  transferredQty: number;
  /** PACK: pieces and boxes packed. */
  packedQty: number;
  boxCount: number;
  /** Lots written to (produce) or taken from (transfer). */
  lotNos: string[];
  productionDate: string;
  shift: string;
  remark: string | null;
  operatorName: string | null;
  createdAt: string;
  reversed: boolean;
  /** Best-effort: the server re-checks (per origin) when it is actually reversed. */
  reversible: boolean;
}

interface Row {
  request_id: string;
  step_index: number;
  step_code: string;
  type: string;
  qty: number;
  source_lot: string | null;
  target_lot: string | null;
  target_lot_remaining: number | null;
  target_wip_untouched: boolean | null;
  pkg_untouched: boolean | null;
  transaction_date: string;
  shift_key: string;
  remark: string | null;
  operator: string | null;
  created_at: string;
  reversed: boolean;
}

/**
 * Read-only history of one order line: every produce / receive / transfer /
 * close request (grouped by requestId), newest first, with whether it has
 * been reversed and whether it still can be. Plan release is not listed.
 */
@Injectable()
export class HistoryService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async history(lineId: string): Promise<HistoryEntry[]> {
    const line = await this.dataSource.query<unknown[]>(
      `SELECT 1 FROM inventory.production_order_lines WHERE id = $1`,
      [lineId],
    );
    if (!line.length) {
      throw new NotFoundException(`ไม่พบรายการสั่งผลิต id ${lineId}`);
    }
    const rows = await this.dataSource.query<Row[]>(
      `SELECT t.request_id::text, t.step_index, ps.code AS step_code,
              t.transaction_type AS type, t.qty,
              sl.lot_no AS source_lot, tl.lot_no AS target_lot,
              tl.remaining_qty AS target_lot_remaining,
              (tw.id IS NOT NULL AND tw.qty_remaining = tw.qty_in AND tw.qty_used = 0
                 AND tw.qty_rejected = 0 AND tw.qty_closed = 0) AS target_wip_untouched,
              (pk.id IS NOT NULL AND pk.status = 'PACKED' AND pk.current_qty = pk.initial_qty) AS pkg_untouched,
              t.transaction_date::text, t.shift_key, t.remark,
              NULLIF(TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), '') AS operator,
              t.created_at::text,
              EXISTS (SELECT 1 FROM inventory.production_transactions r
                       WHERE r.reverses_transaction_id = t.id) AS reversed
       FROM inventory.production_transactions t
       JOIN master.process_steps ps ON ps.id = t.process_step_id
       LEFT JOIN inventory.production_lots sl ON sl.id = t.source_lot_id
       LEFT JOIN inventory.production_lots tl ON tl.id = t.target_lot_id
       LEFT JOIN inventory.process_wip tw ON tw.id = t.target_wip_id
       LEFT JOIN inventory.production_packages pk ON pk.id = t.package_id
       LEFT JOIN iam.users u ON u.id = t.operator_id
       WHERE t.production_order_line_id = $1
         AND t.transaction_type IN ('PROCESS_OUTPUT','FG_RECEIVE','REJECT','TRANSFER','SHORT_CLOSE','PACKING')
       ORDER BY t.id`,
      [lineId],
    );

    const groups = new Map<string, Row[]>();
    for (const r of rows) {
      const list = groups.get(r.request_id) ?? [];
      list.push(r);
      groups.set(r.request_id, list);
    }
    const entries: HistoryEntry[] = [];
    for (const [requestId, list] of groups) {
      const first = list[0];
      const sum = (types: string[]) =>
        list
          .filter((r) => types.includes(r.type))
          .reduce((s, r) => s + Number(r.qty), 0);
      const isTransfer = list.some((r) => r.type === 'TRANSFER');
      const isPack = list.some((r) => r.type === 'PACKING');
      const isClose = list.some((r) => r.type === 'SHORT_CLOSE');
      const isReceive = list.some((r) => r.type === 'FG_RECEIVE');
      const kind: HistoryKind = isPack
        ? 'PACK'
        : isTransfer
          ? 'TRANSFER'
          : isClose
            ? 'CLOSE'
            : isReceive
              ? 'RECEIVE'
              : 'PRODUCE';
      const reversed = list.every((r) => r.reversed);

      // Per target lot: how much this request put there.
      const perLot = new Map<string, { qty: number; remaining: number }>();
      for (const r of list) {
        if (r.type === 'PROCESS_OUTPUT' || r.type === 'FG_RECEIVE') {
          const cur = perLot.get(r.target_lot!) ?? {
            qty: 0,
            remaining: Number(r.target_lot_remaining),
          };
          cur.qty += Number(r.qty);
          perLot.set(r.target_lot!, cur);
        }
      }
      const reversible =
        !reversed &&
        (isPack
          ? list.every((r) => r.pkg_untouched === true)
          : isTransfer
            ? list.every((r) => r.target_wip_untouched === true)
            : [...perLot.values()].every((l) => l.remaining >= l.qty));

      entries.push({
        requestId,
        kind,
        stepIndex: Number(first.step_index),
        stepCode: first.step_code,
        goodQty: sum(['PROCESS_OUTPUT', 'FG_RECEIVE']),
        rejectQty: sum(['REJECT']),
        closedQty: sum(['SHORT_CLOSE']),
        transferredQty: sum(['TRANSFER']),
        packedQty: sum(['PACKING']),
        boxCount: list.filter((r) => r.type === 'PACKING').length,
        lotNos: [
          ...new Set(
            list
              .map((r) => (isTransfer || isPack ? r.source_lot : r.target_lot))
              .filter((n): n is string => !!n),
          ),
        ],
        productionDate: first.transaction_date,
        shift: first.shift_key,
        remark: first.remark,
        operatorName: first.operator,
        createdAt: first.created_at,
        reversed,
        reversible,
      });
    }
    return entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}
