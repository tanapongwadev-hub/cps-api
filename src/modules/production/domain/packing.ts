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

export type WipBoxStatus = 'WAITING' | 'PARTIAL' | 'DONE' | 'CLOSED';

export interface WipBox<K> {
  boxNo: number;
  qty: number;
  /** Pieces of this box already produced / scrapped / closed. */
  doneQty: number;
  status: WipBoxStatus;
  /** Origin pieces in the box, oldest origin first (sums to qty). */
  origins: Array<{ key: K; qty: number }>;
}

/** Box sizes of a batch: full boxes of `packSize`, then a partial one. */
export function boxSizes(qtyIn: number, packSize: number | null): number[] {
  return packSize && packSize > 0 ? splitIntoBoxes(qtyIn, packSize) : [qtyIn];
}

/** Splits an origin list (oldest first) into the nominal origins of each box. */
export function dealOrigins<K>(
  sizes: number[],
  origins: Array<{ key: K; qty: number }>,
): Array<Array<{ key: K; qty: number }>> {
  const pool = origins.map((o) => ({ ...o }));
  let at = 0;
  return sizes.map((qty) => {
    const boxOrigins: Array<{ key: K; qty: number }> = [];
    let need = qty;
    while (need > 0 && at < pool.length) {
      const take = Math.min(need, pool[at].qty);
      if (take > 0) boxOrigins.push({ key: pool[at].key, qty: take });
      pool[at].qty -= take;
      need -= take;
      if (pool[at].qty === 0) at += 1;
    }
    return boxOrigins;
  });
}

/** The origin pieces at positions [from, from+len) of one box's origin list. */
export function sliceOrigins<K>(
  origins: Array<{ key: K; qty: number }>,
  from: number,
  len: number,
): Array<{ key: K; qty: number }> {
  const out: Array<{ key: K; qty: number }> = [];
  let skip = from;
  let need = len;
  for (const o of origins) {
    if (need <= 0) break;
    if (skip >= o.qty) {
      skip -= o.qty;
      continue;
    }
    const take = Math.min(o.qty - skip, need);
    out.push({ key: o.key, qty: take });
    need -= take;
    skip = 0;
  }
  return out;
}

/**
 * Draws `qty` pieces from boxes: `order` lists box numbers (1-based) in the
 * order to work them (default: all, ascending); each gives what it has left.
 * Returns null when the chosen boxes cannot cover `qty`.
 */
export function allocateToBoxes(
  sizes: number[],
  done: number[],
  qty: number,
  order?: number[],
): Array<{ boxNo: number; qty: number }> | null {
  const sequence = order ?? sizes.map((_, i) => i + 1);
  const out: Array<{ boxNo: number; qty: number }> = [];
  let need = qty;
  for (const boxNo of sequence) {
    if (need <= 0) break;
    const left = (sizes[boxNo - 1] ?? 0) - (done[boxNo - 1] ?? 0);
    if (left <= 0) continue;
    const take = Math.min(left, need);
    out.push({ boxNo, qty: take });
    need -= take;
  }
  return need > 0 ? null : out;
}

/**
 * The boxes of one WIP row (a transferred batch): `qtyIn` pieces split into
 * boxes of `packSize` (full first, then a partial one), origins dealt out
 * oldest first. `done[i]` is what box i+1 already gave (produced, scrapped,
 * closed). `closed`: the row was closed out (e.g. its transfer reversed), so
 * unfinished boxes are CLOSED rather than waiting.
 */
export function wipBoxes<K>(
  qtyIn: number,
  packSize: number | null,
  origins: Array<{ key: K; qty: number }>,
  done: number[],
  closed = false,
): WipBox<K>[] {
  const sizes = boxSizes(qtyIn, packSize);
  const dealt = dealOrigins(sizes, origins);
  return sizes.map((qty, i) => {
    const doneQty = Math.max(0, Math.min(qty, done[i] ?? 0));
    return {
      boxNo: i + 1,
      qty,
      doneQty,
      status:
        doneQty === qty
          ? 'DONE'
          : closed
            ? 'CLOSED'
            : doneQty === 0
              ? 'WAITING'
              : 'PARTIAL',
      origins: dealt[i],
    };
  });
}
