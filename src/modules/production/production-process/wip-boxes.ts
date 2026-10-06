import { ConflictException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { qrSvgDataUrl } from '../../../common/qr-svg';
import {
  allocateToBoxes,
  boxSizes,
  dealOrigins,
  sliceOrigins,
  transferBoxCode,
  wipBoxes,
  type WipBoxStatus,
} from '../domain/packing';
import type { OriginQty } from '../production-transaction/ledger.service';

export interface TransferBox {
  /** QR content of the box: {batch QR}-B{nnn}. */
  qrCode: string;
  /** data: URL (SVG) */
  qrImage: string;
  batchQr: string;
  wipId: string;
  sourceLotNo: string;
  boxNo: number;
  boxCount: number;
  qty: number;
  doneQty: number;
  status: WipBoxStatus;
  origins: Array<{ lotNo: string; qty: number }>;
}

interface WipBoxState {
  wipId: string;
  qrCode: string;
  sourceLotNo: string;
  qtyIn: number;
  packSize: number | null;
  /** The row was closed out without ledger rows (its transfer was reversed). */
  closedOut: boolean;
  /** Oldest first. */
  origins: Array<{ key: string; lotNo: string; qty: number }>;
  /** Pieces already taken out of each box (index = box no - 1). */
  done: number[];
}

/**
 * Box state of the given WIP rows (only transferred batches have a QR/boxes).
 * Pieces done per box = ledger box rows; consumption that predates box rows
 * (legacy) is applied first-box-first so old orders still show something sane.
 */
async function loadBoxStates(
  manager: EntityManager,
  wipIds: string[],
): Promise<Map<string, WipBoxState>> {
  const states = new Map<string, WipBoxState>();
  if (!wipIds.length) return states;
  const rows = (await manager.query(
    `SELECT w.id, w.qr_code, w.qty_in, w.pack_size, w.status, w.qty_remaining, l.lot_no
     FROM inventory.process_wip w
     JOIN inventory.production_lots l ON l.id = w.source_lot_id
     WHERE w.id = ANY($1::bigint[]) AND w.qr_code IS NOT NULL
     ORDER BY w.id`,
    [wipIds],
  )) as unknown as Array<{
    id: string;
    qr_code: string;
    qty_in: number;
    pack_size: number | null;
    status: string;
    qty_remaining: number;
    lot_no: string;
  }>;
  if (!rows.length) return states;
  const ids = rows.map((r) => r.id);
  const origins = (await manager.query(
    `SELECT o.wip_id, o.origin_lot_id, l.lot_no, o.qty
     FROM inventory.process_wip_origins o
     JOIN inventory.production_lots l ON l.id = o.origin_lot_id
     WHERE o.wip_id = ANY($1::bigint[])
     ORDER BY l.production_date, l.id`,
    [ids],
  )) as unknown as Array<{
    wip_id: string;
    origin_lot_id: string;
    lot_no: string;
    qty: number;
  }>;
  const boxRows = (await manager.query(
    `SELECT wip_id, box_no, SUM(qty)::int AS qty
     FROM inventory.production_transaction_boxes
     WHERE wip_id = ANY($1::bigint[]) GROUP BY wip_id, box_no`,
    [ids],
  )) as unknown as Array<{ wip_id: string; box_no: number; qty: number }>;
  // Ledger consumption of the row (net of reversals), to find legacy usage.
  const ledger = (await manager.query(
    `SELECT t.source_wip_id AS wip_id, COALESCE(SUM(t.qty), 0)::int AS qty
     FROM inventory.production_transactions t
     LEFT JOIN inventory.production_transactions o ON o.id = t.reverses_transaction_id
     WHERE t.source_wip_id = ANY($1::bigint[])
       AND (t.transaction_type IN ('PROCESS_OUTPUT','FG_RECEIVE','REJECT','SHORT_CLOSE')
            OR (t.transaction_type = 'REVERSAL'
                AND o.transaction_type IN ('PROCESS_OUTPUT','FG_RECEIVE','REJECT','SHORT_CLOSE')))
     GROUP BY t.source_wip_id`,
    [ids],
  )) as unknown as Array<{ wip_id: string; qty: number }>;

  for (const row of rows) {
    const sizes = boxSizes(
      Number(row.qty_in),
      row.pack_size === null ? null : Number(row.pack_size),
    );
    const done = sizes.map(() => 0);
    let explained = 0;
    for (const b of boxRows) {
      if (String(b.wip_id) !== String(row.id)) continue;
      done[Number(b.box_no) - 1] = Number(b.qty);
      explained += Number(b.qty);
    }
    const ledgerQty = Number(
      ledger.find((l) => String(l.wip_id) === String(row.id))?.qty ?? 0,
    );
    const legacy = ledgerQty - explained;
    if (legacy > 0) {
      for (const a of allocateToBoxes(sizes, done, legacy) ?? []) {
        done[a.boxNo - 1] += a.qty;
      }
    }
    states.set(String(row.id), {
      wipId: String(row.id),
      qrCode: row.qr_code,
      sourceLotNo: row.lot_no,
      qtyIn: Number(row.qty_in),
      packSize: row.pack_size === null ? null : Number(row.pack_size),
      closedOut: row.status === 'DONE' && Number(row.qty_remaining) === 0,
      origins: origins
        .filter((o) => String(o.wip_id) === String(row.id))
        .map((o) => ({
          key: String(o.origin_lot_id),
          lotNo: o.lot_no,
          qty: Number(o.qty),
        })),
      done,
    });
  }
  return states;
}

/**
 * Boxes (one QR each) of the given WIP rows — transferred batches. Rows
 * without a QR (plan release) have no boxes.
 */
export async function loadWipBoxes(
  manager: EntityManager,
  wipIds: string[],
): Promise<Map<string, TransferBox[]>> {
  const result = new Map<string, TransferBox[]>();
  const states = await loadBoxStates(manager, wipIds);
  for (const st of states.values()) {
    const lotNoOf = new Map(st.origins.map((o) => [o.key, o.lotNo]));
    const boxes = wipBoxes(
      st.qtyIn,
      st.packSize,
      st.origins.map((o) => ({ key: o.key, qty: o.qty })),
      st.done,
      st.closedOut,
    );
    result.set(
      st.wipId,
      await Promise.all(
        boxes.map(async (b) => {
          const code = transferBoxCode(st.qrCode, b.boxNo);
          return {
            qrCode: code,
            qrImage: await qrSvgDataUrl(code),
            batchQr: st.qrCode,
            wipId: st.wipId,
            sourceLotNo: st.sourceLotNo,
            boxNo: b.boxNo,
            boxCount: boxes.length,
            qty: b.qty,
            doneQty: b.doneQty,
            status: b.status,
            origins: b.origins.map((o) => ({
              lotNo: lotNoOf.get(o.key) ?? o.key,
              qty: o.qty,
            })),
          };
        }),
      ),
    );
  }
  return result;
}

export interface BoxConsumption {
  /** Origin pieces taken out (and already deducted from the WIP row's pool). */
  origins: OriginQty[];
  boxes: Array<{ boxNo: number; qty: number }>;
}

/**
 * Takes `qty` pieces out of a transferred batch box by box (`order` = box
 * numbers to work, default all ascending). The origins of those pieces are
 * the boxes' own nominal origins, so what a box shows is what flows on; the
 * row's origin pool is reduced to match. Call `recordBoxRows` with the ledger
 * row's id afterwards. Order line and WIP row must be locked by the caller.
 */
export async function consumeFromBoxes(
  manager: EntityManager,
  wipId: string,
  qty: number,
  order?: number[],
): Promise<BoxConsumption> {
  const state = (await loadBoxStates(manager, [wipId])).get(wipId);
  if (!state) throw new ConflictException('งานชุดนี้ไม่มี QR กล่อง');
  const sizes = boxSizes(state.qtyIn, state.packSize);
  const picked = allocateToBoxes(sizes, state.done, qty, order);
  if (!picked) {
    throw new ConflictException(
      'กล่องที่เลือกมีชิ้นงานคงเหลือไม่พอสำหรับจำนวนที่บันทึก',
    );
  }
  const dealt = dealOrigins(
    sizes,
    state.origins.map((o) => ({ key: o.key, qty: o.qty })),
  );
  const taken = new Map<string, number>();
  for (const p of picked) {
    const part = sliceOrigins(
      dealt[p.boxNo - 1],
      state.done[p.boxNo - 1],
      p.qty,
    );
    for (const o of part) taken.set(o.key, (taken.get(o.key) ?? 0) + o.qty);
  }
  for (const [originLotId, n] of taken) {
    await manager.query(
      `UPDATE inventory.process_wip_origins SET qty_remaining = qty_remaining - $3
       WHERE wip_id = $1 AND origin_lot_id = $2`,
      [wipId, originLotId, n],
    );
  }
  return {
    origins: [...taken].map(([originLotId, n]) => ({ originLotId, qty: n })),
    boxes: picked,
  };
}

/** Writes the per-box rows of a ledger transaction (append-only). */
export async function recordBoxRows(
  manager: EntityManager,
  transactionId: string,
  wipId: string,
  boxes: Array<{ boxNo: number; qty: number }>,
): Promise<void> {
  for (const b of boxes) {
    await manager.query(
      `INSERT INTO inventory.production_transaction_boxes (transaction_id, wip_id, box_no, qty)
       VALUES ($1, $2, $3, $4)`,
      [transactionId, wipId, b.boxNo, b.qty],
    );
  }
}

/** A reversal takes the original's pieces back out of the same boxes. */
export async function mirrorBoxRows(
  manager: EntityManager,
  originalTransactionId: string,
  reversalTransactionId: string,
): Promise<void> {
  await manager.query(
    `INSERT INTO inventory.production_transaction_boxes (transaction_id, wip_id, box_no, qty)
     SELECT $2, wip_id, box_no, -qty
     FROM inventory.production_transaction_boxes WHERE transaction_id = $1`,
    [originalTransactionId, reversalTransactionId],
  );
}

/**
 * Boxes of a step that still hold pieces, looked up by scanned QR codes
 * (in scan order) — used by produce to work specific boxes.
 */
export async function resolveBoxes(
  manager: EntityManager,
  lineId: string,
  stepIndex: number,
  codes: string[],
  parse: (code: string) => { batchQr: string; boxNo: number } | null,
): Promise<
  Array<{ wipId: string; boxNo: number; qrCode: string; left: number }>
> {
  const out: Array<{
    wipId: string;
    boxNo: number;
    qrCode: string;
    left: number;
  }> = [];
  const seen = new Set<string>();
  for (const code of codes) {
    const ref = parse(code);
    if (!ref) throw new ConflictException(`QR กล่อง "${code}" ไม่ถูกต้อง`);
    const key = `${ref.batchQr}#${ref.boxNo}`;
    if (seen.has(key)) {
      throw new ConflictException(`สแกนกล่อง ${code} ซ้ำ`);
    }
    seen.add(key);
    const wip = (await manager.query(
      `SELECT id FROM inventory.process_wip
       WHERE qr_code = $1 AND production_order_line_id = $2 AND step_index = $3`,
      [ref.batchQr, lineId, stepIndex],
    )) as unknown as Array<{ id: string }>;
    if (!wip.length) {
      throw new ConflictException(`กล่อง ${code} ไม่ได้อยู่ที่ขั้นตอนนี้`);
    }
    const state = (await loadBoxStates(manager, [String(wip[0].id)])).get(
      String(wip[0].id),
    );
    const sizes = state ? boxSizes(state.qtyIn, state.packSize) : [];
    const size = sizes[ref.boxNo - 1];
    if (!state || !size) {
      throw new ConflictException(`ไม่พบกล่อง ${code}`);
    }
    const left = state.closedOut ? 0 : size - state.done[ref.boxNo - 1];
    if (left <= 0) {
      throw new ConflictException(`กล่อง ${code} ไม่มีชิ้นงานเหลือให้ผลิต`);
    }
    out.push({
      wipId: String(wip[0].id),
      boxNo: ref.boxNo,
      qrCode: code.trim().toUpperCase(),
      left,
    });
  }
  return out;
}
