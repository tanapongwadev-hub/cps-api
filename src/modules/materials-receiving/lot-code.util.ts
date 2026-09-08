/**
 * Custom month-letter mapping used by Material Receiving's Internal Lot /
 * Supplier Lot codes — NOT a standard calendar-month abbreviation. The
 * business explicitly excludes "E" (to avoid confusion with other codes),
 * so December lands on "M" instead of "L".
 *
 *   Jan=A Feb=B Mar=C Apr=D May=F Jun=G Jul=H Aug=I Sep=J Oct=K Nov=L Dec=M
 */
const MONTH_CODES = [
  'A',
  'B',
  'C',
  'D',
  'F',
  'G',
  'H',
  'I',
  'J',
  'K',
  'L',
  'M',
] as const;

export function monthCode(month: number): string {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error(`Invalid month: ${month}`);
  }
  return MONTH_CODES[month - 1];
}

/**
 * YYYY-MM-DD → {YY}{MonthCode}{DD}
 * e.g. 2026-09-07 → "26J07", 2026-12-31 → "26M31"
 */
export function buildLotDatePart(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return `${year.slice(2)}${monthCode(Number(month))}${day}`;
}
