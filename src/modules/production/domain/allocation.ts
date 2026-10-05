/** A quantity bucket that can be drawn from (a WIP row, a lot, an origin). */
export interface AllocatableRow {
  id: string;
  remaining: number;
}

export interface Allocation {
  id: string;
  qty: number;
}

export class InsufficientQuantityError extends Error {
  constructor(
    readonly requested: number,
    readonly available: number,
  ) {
    super(`requested ${requested}, available ${available}`);
  }
}

/**
 * FIFO: draw `qty` from `rows` in the order given (callers pass them already
 * sorted, e.g. WIP by received_at, id). Pieces are whole numbers; throws when
 * the rows together hold less than `qty`.
 */
export function allocateFifo(
  rows: readonly AllocatableRow[],
  qty: number,
): Allocation[] {
  if (!Number.isInteger(qty) || qty <= 0) {
    throw new Error(`quantity must be a positive integer: ${qty}`);
  }
  const available = rows.reduce((sum, r) => sum + Math.max(0, r.remaining), 0);
  if (qty > available) throw new InsufficientQuantityError(qty, available);

  const result: Allocation[] = [];
  let left = qty;
  for (const row of rows) {
    if (left === 0) break;
    const take = Math.min(left, Math.max(0, row.remaining));
    if (take > 0) {
      result.push({ id: row.id, qty: take });
      left -= take;
    }
  }
  return result;
}
