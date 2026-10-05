/**
 * Lot numbers: `{prefix}-{YY}{MM}{DD}-{seq}` with a 2-digit Buddhist-era year,
 * e.g. WE-691001-001 = first WE lot of 1 Oct 2569 (2026).
 * Prefix = the process step code, except receiving steps: FG / ST.
 */
export type ReceivingType = 'NONE' | 'FG' | 'STORE';

export function lotPrefix(
  processCode: string,
  receivingType: ReceivingType,
): string {
  if (receivingType === 'FG') return 'FG';
  if (receivingType === 'STORE') return 'ST';
  return processCode.trim().toUpperCase();
}

/** `productionDate` is YYYY-MM-DD; `seq` starts at 1 per prefix per day. */
export function formatLotNo(
  prefix: string,
  productionDate: string,
  seq: number,
): string {
  const [year, month, day] = productionDate.split('-').map(Number);
  if (!year || !month || !day || !Number.isInteger(seq) || seq < 1) {
    throw new Error(`invalid lot number input: ${productionDate} #${seq}`);
  }
  const be = String((year + 543) % 100).padStart(2, '0');
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${prefix}-${be}${mm}${dd}-${String(seq).padStart(3, '0')}`;
}
