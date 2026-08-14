import { TransformFnParams } from 'class-transformer';

/** id ของ FK ทุกตัวเป็นสตริงตัวเลขบวก แบบเดียวกับโมดูลอื่น */
export const POSITIVE_DECIMAL_ID = /^[1-9]\d*$/;

/** จำนวนและราคาแบบ NUMERIC(18,4) ที่ไม่เป็นลบ */
export const DECIMAL_18_4 = /^\d{1,14}(\.\d{1,4})?$/;

/** วันที่แบบ YYYY-MM-DD ตรงกับคอลัมน์ชนิด DATE */
export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Internal Lot No. ของ Materials Receiving: CCI-YYYYMMDD-XXX */
export const INTERNAL_LOT_NO_PATTERN = /^CCI-\d{8}-\d{3}$/;

/** Supplier Lot No.: SUP-YYYYMMDD */
export const SUPPLIER_LOT_NO_PATTERN = /^SUP-\d{8}$/;

/** PO No. — ตัวอักษร/ตัวเลข/dash/underscore/space ความยาว 1–30 ตัว */
export const PO_NO_PATTERN = /^[A-Za-z0-9_/ \-]{1,30}$/;

export function sourceValue(params: TransformFnParams): unknown {
  const source: unknown = params.obj;
  if (
    source !== null &&
    typeof source === 'object' &&
    Object.prototype.hasOwnProperty.call(source, params.key)
  ) {
    return Reflect.get(source, params.key);
  }
  return params.value;
}

export function trimString(params: TransformFnParams): unknown {
  const value = sourceValue(params);
  return typeof value === 'string' ? value.trim() : value;
}

export function nullableTrimmedString(params: TransformFnParams): unknown {
  const value = sourceValue(params);
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export function queryBoolean(params: TransformFnParams): unknown {
  const value = sourceValue(params);
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

/**
 * NUMERIC ถูกส่งกลับจาก pg driver เป็นสตริง จึงรับเป็นสตริงเพื่อไม่ให้เสียความละเอียด
 * แต่ยอมรับ number ที่ client ส่งมาแล้วแปลงเป็นสตริงให้
 */
export function decimalString(params: TransformFnParams): unknown {
  const value = sourceValue(params);
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value.toString();
  }
  return typeof value === 'string' ? value.trim() : value;
}

export function nullableDecimalString(params: TransformFnParams): unknown {
  const value = decimalString(params);
  if (typeof value !== 'string') return value;
  return value === '' ? null : value;
}
