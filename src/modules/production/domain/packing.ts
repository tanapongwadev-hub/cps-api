/**
 * Splits `qty` pieces into boxes of `packSize`: full boxes first, then one
 * partial box with the remainder (e.g. 150 by 100 → [100, 50]).
 */
export function splitIntoBoxes(qty: number, packSize: number): number[] {
  if (!Number.isInteger(qty) || qty <= 0) {
    throw new Error(`quantity must be a positive integer: ${qty}`);
  }
  if (!Number.isInteger(packSize) || packSize <= 0) {
    throw new Error(`pack size must be a positive integer: ${packSize}`);
  }
  const full = Math.floor(qty / packSize);
  const rest = qty - full * packSize;
  return [
    ...Array.from({ length: full }, () => packSize),
    ...(rest > 0 ? [rest] : []),
  ];
}

/** QR content of a transfer tag: TQ-{source lot no}-S{to step no}-{nn}. */
export function transferQrCode(
  sourceLotNo: string,
  toStepIndex: number,
  seq: number,
): string {
  return `TQ-${sourceLotNo}-S${toStepIndex + 1}-${String(seq).padStart(2, '0')}`;
}

/** QR content of a box: QR-{lot no}-BOX{nnn}, e.g. QR-FG-691002-001-BOX001. */
export function packageQrCode(lotNo: string, boxNo: number): string {
  return `QR-${lotNo}-BOX${String(boxNo).padStart(3, '0')}`;
}

/** QR of one box of a transfer batch: {batch QR}-B{nnn}. */
export function transferBoxCode(batchQr: string, boxNo: number): string {
  return `${batchQr}-B${String(boxNo).padStart(3, '0')}`;
}

/** Splits a box code back into its batch QR and box number (null if not a box code). */
export function parseTransferBoxCode(
  code: string,
): { batchQr: string; boxNo: number } | null {
  const m = /^(TQ-.+)-B(\d{3,})$/i.exec(code.trim());
  return m ? { batchQr: m[1].toUpperCase(), boxNo: Number(m[2]) } : null;
}

export type WipBoxStatus = 'WAITING' | 'PARTIAL' | 'DONE';

export interface WipBox<K> {
  boxNo: number;
  qty: number;
  /** Pieces of this box already produced / scrapped / closed. */
  doneQty: number;
  status: WipBoxStatus;
  /** Origin pieces in the box, oldest origin first (sums to qty). */
  origins: Array<{ key: K; qty: number }>;
}

/**
 * The boxes of one WIP row (a transferred batch): `qtyIn` pieces split into
 * boxes of `packSize` (full ones first, then a partial one). Origins are
 * dealt out in order (oldest first), the same order the row gives its pieces
 * up. `consumed` (used + rejected + closed) is applied from the first box on —
 * the row hands out pieces FIFO, so box 1 is worked on first. Boxes are
 * computed, never stored, so reversals need no bookkeeping.
 */
export function wipBoxes<K>(
  qtyIn: number,
  packSize: number | null,
  origins: Array<{ key: K; qty: number }>,
  consumed: number,
): WipBox<K>[] {
  const sizes =
    packSize && packSize > 0 ? splitIntoBoxes(qtyIn, packSize) : [qtyIn];
  const pool = origins.map((o) => ({ ...o }));
  let at = 0;
  let left = consumed;
  return sizes.map((qty, i) => {
    const boxOrigins: Array<{ key: K; qty: number }> = [];
    let need = qty;
    while (need > 0 && at < pool.length) {
      const take = Math.min(need, pool[at].qty);
      if (take > 0) boxOrigins.push({ key: pool[at].key, qty: take });
      pool[at].qty -= take;
      need -= take;
      if (pool[at].qty === 0) at += 1;
    }
    const doneQty = Math.max(0, Math.min(qty, left));
    left -= doneQty;
    return {
      boxNo: i + 1,
      qty,
      doneQty,
      status: doneQty === 0 ? 'WAITING' : doneQty < qty ? 'PARTIAL' : 'DONE',
      origins: boxOrigins,
    };
  });
}
