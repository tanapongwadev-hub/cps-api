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

/** QR content of a box: QR-{lot no}-BOX{nnn}, e.g. QR-FG-691002-001-BOX001. */
export function packageQrCode(lotNo: string, boxNo: number): string {
  return `QR-${lotNo}-BOX${String(boxNo).padStart(3, '0')}`;
}
