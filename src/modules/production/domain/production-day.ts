/**
 * Factory production day and shift (Asia/Bangkok, UTC+7, no DST).
 *   Shift A: 08:00–16:59
 *   Shift B: 17:00–07:59 the next morning — belongs to the day it started,
 *            so 02:00 on 2 Oct is shift B of 1 Oct.
 */
export const SHIFTS = ['A', 'B'] as const;
export type Shift = (typeof SHIFTS)[number];

export const SHIFT_A_START_HOUR = 8;
export const SHIFT_B_START_HOUR = 17;
/** How many production days back a record may be dated. */
export const MAX_BACKDATE_DAYS = 2;

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;

export interface ProductionDay {
  /** YYYY-MM-DD */
  productionDate: string;
  shift: Shift;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function productionDayOf(at: Date): ProductionDay {
  const local = new Date(at.getTime() + BANGKOK_OFFSET_MS);
  const hour = local.getUTCHours();
  if (hour < SHIFT_A_START_HOUR) {
    local.setUTCDate(local.getUTCDate() - 1);
    return { productionDate: isoDate(local), shift: 'B' };
  }
  return {
    productionDate: isoDate(local),
    shift: hour < SHIFT_B_START_HOUR ? 'A' : 'B',
  };
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return isoDate(d);
}

const SHIFT_ORDER: Record<Shift, number> = { A: 0, B: 1 };

/**
 * Validates a requested production day/shift against "now": not in the
 * future (a later day, or shift B while shift A is running) and not more than
 * MAX_BACKDATE_DAYS back. Returns a Thai error message, or null when valid.
 */
export function validateProductionDay(
  requested: ProductionDay,
  now: Date,
): string | null {
  const current = productionDayOf(now);
  if (
    requested.productionDate > current.productionDate ||
    (requested.productionDate === current.productionDate &&
      SHIFT_ORDER[requested.shift] > SHIFT_ORDER[current.shift])
  ) {
    return 'วันผลิตหรือกะต้องไม่อยู่ในอนาคต';
  }
  const earliest = addDays(current.productionDate, -MAX_BACKDATE_DAYS);
  if (requested.productionDate < earliest) {
    return `บันทึกย้อนหลังได้ไม่เกิน ${MAX_BACKDATE_DAYS} วัน`;
  }
  return null;
}
