import { EntityManager } from 'typeorm';
import { qrSvgDataUrl } from '../../../common/qr-svg';
import {
  transferBoxCode,
  wipBoxes,
  type WipBoxStatus,
} from '../domain/packing';

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

/**
 * Boxes (one QR each) of the given WIP rows — transferred batches. Boxes are
 * derived from the row (qty_in, pack_size, origins, consumed so far), see
 * domain wipBoxes. Rows without a QR (plan release) have no boxes.
 */
export async function loadWipBoxes(
  manager: EntityManager,
  wipIds: string[],
): Promise<Map<string, TransferBox[]>> {
  const result = new Map<string, TransferBox[]>();
  if (!wipIds.length) return result;
  const rows = (await manager.query(
    `SELECT w.id, w.qr_code, w.qty_in, w.qty_used, w.qty_rejected, w.qty_closed,
            w.pack_size, l.lot_no
     FROM inventory.process_wip w
     JOIN inventory.production_lots l ON l.id = w.source_lot_id
     WHERE w.id = ANY($1::bigint[]) AND w.qr_code IS NOT NULL
     ORDER BY w.id`,
    [wipIds],
  )) as unknown as Array<{
    id: string;
    qr_code: string;
    qty_in: number;
    qty_used: number;
    qty_rejected: number;
    qty_closed: number;
    pack_size: number | null;
    lot_no: string;
  }>;
  const origins = (await manager.query(
    `SELECT o.wip_id, l.lot_no, o.qty
     FROM inventory.process_wip_origins o
     JOIN inventory.production_lots l ON l.id = o.origin_lot_id
     WHERE o.wip_id = ANY($1::bigint[])
     ORDER BY l.production_date, l.id`,
    [wipIds],
  )) as unknown as Array<{ wip_id: string; lot_no: string; qty: number }>;

  for (const row of rows) {
    const boxes = wipBoxes(
      Number(row.qty_in),
      row.pack_size === null ? null : Number(row.pack_size),
      origins
        .filter((o) => String(o.wip_id) === String(row.id))
        .map((o) => ({ key: o.lot_no, qty: Number(o.qty) })),
      Number(row.qty_used) + Number(row.qty_rejected) + Number(row.qty_closed),
    );
    result.set(
      String(row.id),
      await Promise.all(
        boxes.map(async (b) => {
          const code = transferBoxCode(row.qr_code, b.boxNo);
          return {
            qrCode: code,
            qrImage: await qrSvgDataUrl(code),
            batchQr: row.qr_code,
            wipId: String(row.id),
            sourceLotNo: row.lot_no,
            boxNo: b.boxNo,
            boxCount: boxes.length,
            qty: b.qty,
            doneQty: b.doneQty,
            status: b.status,
            origins: b.origins.map((o) => ({ lotNo: o.key, qty: o.qty })),
          };
        }),
      ),
    );
  }
  return result;
}
