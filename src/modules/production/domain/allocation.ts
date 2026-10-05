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
 * MANUAL: checks a user-chosen split of `qty` across `rows`. Returns a Thai
 * error message, or null when every line names a row that exists, no row is
 * named twice, no line takes more than the row holds, and the lines add up
 * to exactly `qty`.
 */
export function validateManualAllocation(
  rows: readonly AllocatableRow[],
  allocations: readonly Allocation[],
  qty: number,
): string | null {
  if (!allocations.length) return 'ต้องระบุรายการที่จะใช้อย่างน้อย 1 รายการ';
  const seen = new Set<string>();
  let total = 0;
  for (const a of allocations) {
    if (!Number.isInteger(a.qty) || a.qty <= 0) {
      return 'จำนวนในแต่ละรายการต้องเป็นจำนวนเต็มมากกว่า 0';
    }
    if (seen.has(a.id)) return 'เลือกรายการซ้ำกัน';
    seen.add(a.id);
    const row = rows.find((r) => r.id === a.id);
    if (!row) return 'รายการที่เลือกไม่อยู่ในขั้นตอนนี้ หรือไม่มียอดคงเหลือ';
    if (a.qty > row.remaining) {
      return `เลือกเกินยอดคงเหลือ (คงเหลือ ${row.remaining} ชิ้น)`;
    }
    total += a.qty;
  }
  if (total !== qty) {
    return `ยอดที่เลือกรวม ${total} ชิ้น ไม่เท่ากับจำนวน ${qty} ชิ้น`;
  }
  return null;
}

/** A WIP row tagged with the lot it came from (null = plan release). */
export interface SourcedRow extends AllocatableRow {
  sourceId: string | null;
}

/**
 * MANUAL at produce: the user picks source lots and quantities (`picks`,
 * id = source lot id). Validates the picks against the per-lot totals of
 * `rows`, then draws each pick FIFO from that lot's own rows (rows are given
 * in FIFO order). Returns per-row allocations, or a Thai error message.
 */
export function allocateBySource(
  rows: readonly SourcedRow[],
  picks: readonly Allocation[],
  qty: number,
): { allocations: Allocation[] } | { error: string } {
  const totals = new Map<string, number>();
  for (const row of rows) {
    if (row.sourceId === null || row.remaining <= 0) continue;
    totals.set(row.sourceId, (totals.get(row.sourceId) ?? 0) + row.remaining);
  }
  const error = validateManualAllocation(
    [...totals].map(([id, remaining]) => ({ id, remaining })),
    picks,
    qty,
  );
  if (error) return { error };
  const allocations: Allocation[] = [];
  for (const pick of picks) {
    allocations.push(
      ...allocateFifo(
        rows.filter((r) => r.sourceId === pick.id),
        pick.qty,
      ),
    );
  }
  return { allocations };
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
