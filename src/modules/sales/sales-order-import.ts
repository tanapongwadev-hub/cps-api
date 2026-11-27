import { BadRequestException } from '@nestjs/common';

/**
 * Customer "ใบแจ้งยอดส่งสินค้า" sheets (HONDA, CNN, ...): a title row with
 * `: YYYY-MM-DD`, a header row somewhere in the first rows, then one line
 * per delivery. Cells arrive as plain values (see `cellToPrimitive`).
 */
export interface ImportedLine {
  row: number;
  partNo: string;
  quantity: number;
  customerPo: string | null;
  deliveryTime: string | null;
  deliveryPoint: string | null;
  customerLine: string | null;
}

export interface ParsedStatement {
  orderDate: string | null;
  lot: string | null;
  lines: ImportedLine[];
}

const HEADER_SCAN_ROWS = 10;

/** Cells are primitives after `cellToPrimitive`; anything else reads as empty. */
const str = (value: unknown): string =>
  typeof value === 'string' || typeof value === 'number' ? String(value) : '';

const norm = (value: unknown) =>
  str(value).replace(/\s+/g, '').replace(/\./g, '').toLowerCase();

const text = (value: unknown): string | null => {
  const out = str(value).trim();
  return out ? out : null;
};

/** exceljs cell value → string/number/null (formula results, rich text, dates). */
export function cellToPrimitive(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    const v = value as {
      result?: unknown;
      richText?: Array<{ text: string }>;
      text?: unknown;
    };
    if (v.result !== undefined) return cellToPrimitive(v.result);
    if (Array.isArray(v.richText))
      return v.richText.map((t) => t.text).join('');
    if (v.text !== undefined) return cellToPrimitive(v.text);
    return null;
  }
  return value;
}

export function parseDeliveryStatement(rows: unknown[][]): ParsedStatement {
  let headerIndex = -1;
  const columns = new Map<string, number>();
  for (let i = 0; i < Math.min(rows.length, HEADER_SCAN_ROWS); i += 1) {
    const names = (rows[i] ?? []).map(norm);
    if (names.includes('partno') && names.includes('qty')) {
      headerIndex = i;
      names.forEach((name, column) => {
        if (name && !columns.has(name)) columns.set(name, column);
      });
      break;
    }
  }
  if (headerIndex < 0) {
    throw new BadRequestException(
      `ไม่พบหัวตารางที่มีคอลัมน์ PartNo และ Qty ใน ${HEADER_SCAN_ROWS} แถวแรก`,
    );
  }

  let orderDate: string | null = null;
  for (const row of rows.slice(0, headerIndex)) {
    for (const cell of row ?? []) {
      const match = str(cell).match(/:\s*(\d{4}-\d{2}-\d{2})/);
      if (match) {
        orderDate = match[1];
        break;
      }
    }
    if (orderDate) break;
  }

  const col = (name: string) => columns.get(name);
  const at = (row: unknown[], name: string) => {
    const index = col(name);
    return index === undefined ? null : text(row[index]);
  };

  const lines: ImportedLine[] = [];
  let lot: string | null = null;
  for (let i = headerIndex + 1; i < rows.length; i += 1) {
    const row = rows[i] ?? [];
    const partNo = at(row, 'partno');
    const qtyRaw = row[col('qty')!];
    if (!partNo && (qtyRaw === null || qtyRaw === undefined || qtyRaw === ''))
      continue;
    const excelRow = i + 1;
    const quantity = Number(qtyRaw);
    if (!partNo || !Number.isInteger(quantity) || quantity <= 0) {
      throw new BadRequestException(
        `แถว ${excelRow}: ต้องมี PartNo และ Qty เป็นจำนวนเต็มมากกว่า 0`,
      );
    }
    lot ??= at(row, 'lotno');
    lines.push({
      row: excelRow,
      partNo,
      quantity,
      customerPo: at(row, 'pono'),
      deliveryTime: at(row, 'time'),
      deliveryPoint: at(row, 'home'),
      customerLine: at(row, 'line'),
    });
  }
  if (!lines.length) {
    throw new BadRequestException('ไม่พบรายการสินค้าในไฟล์');
  }
  return { orderDate, lot, lines };
}

/**
 * FIFO take from boxes (already in FIFO order) for one order line. `reserved`
 * holds quantity other orders still hold; `planned` collects what earlier
 * lines of the same confirmation took and is updated in place, so the same
 * product on several lines never reserves a box twice.
 */
export function allocateFromBoxes(
  boxes: Array<{ id: string; currentQty: number }>,
  reserved: Map<string, number>,
  planned: Map<string, number>,
  need: number,
) {
  const takes: Array<{ packageId: string; qty: number }> = [];
  let left = need;
  let available = 0;
  for (const box of boxes) {
    const free =
      box.currentQty - (reserved.get(box.id) ?? 0) - (planned.get(box.id) ?? 0);
    if (free <= 0) continue;
    available += free;
    if (left <= 0) continue;
    const take = Math.min(free, left);
    takes.push({ packageId: box.id, qty: take });
    planned.set(box.id, (planned.get(box.id) ?? 0) + take);
    left -= take;
  }
  return { takes, shortfall: left, available };
}
