import { BOMS_PERMISSIONS } from '../../modules/boms/boms-permissions';
import { CATEGORY_PERMISSIONS } from '../../modules/categories/category-permissions';
import { DELIVERY_TYPE_PERMISSIONS } from '../../modules/delivery-types/delivery-type-permissions';
import { LOADING_POINT_PERMISSIONS } from '../../modules/loading-points/loading-point-permissions';
import { MATERIAL_MODEL_PERMISSIONS } from '../../modules/material-models/material-model-permissions';
import { MATERIAL_PERMISSIONS } from '../../modules/materials/material-permissions';
import { MATERIALS_DISBURSEMENT_PERMISSIONS } from '../../modules/materials-disbursement/materials-disbursement-permissions';
import { MATERIALS_RECEIVING_PERMISSIONS } from '../../modules/materials-receiving/materials-receiving-permissions';
import { ORGANIZATION_PERMISSIONS } from '../../modules/organizations/organization-permissions';
import { PRODUCTS_PERMISSIONS } from '../../modules/products/products-permissions';
import { REJECT_REASON_PERMISSIONS } from '../../modules/reject-reasons/reject-reason-permissions';
import { STATUS_ITEM_PERMISSIONS } from '../../modules/status-items/status-item-permissions';
import { SUPPLIER_PERMISSIONS } from '../../modules/suppliers/supplier-permissions';
import { UNIT_PERMISSIONS } from '../../modules/units/unit-permissions';

/** action ที่ทุกเมนูมีตามค่าเริ่มต้น */
export const DEFAULT_ACTION_CODES = [
  'CREATE',
  'READ',
  'UPDATE',
  'DELETE',
] as const;

/** action เพิ่มเติมที่ใช้กับเอกสารธุรกรรม */
export const DOCUMENT_ACTION_CODES = [
  ...DEFAULT_ACTION_CODES,
  'POST',
  'CANCEL',
] as const;

/**
 * action สำหรับ Materials Receiving
 * - POST   -> CONFIRM (เปลี่ยนสถานะ draft -> confirmed และ update stock)
 * - CANCEL -> CANCEL (ยกเลิกใบรับ และ revert stock ถ้าเคย confirm)
 * ใช้ POST/CANCEL action เดิมได้ แต่ permission code แยกเพื่อให้สิทธิ์ละเอียดกว่า
 */
export const MATERIALS_RECEIVING_ACTION_CODES = [
  'CREATE',
  'READ',
  'UPDATE',
  'DELETE',
  'POST',
  'CANCEL',
] as const;

/**
 * action สำหรับ Materials Disbursement
 * - POST   -> CONFIRM (จ่ายวัตถุดิบ + FIFO)
 * - CANCEL -> CANCEL (ยกเลิกและ revert stock)
 */
export const MATERIALS_DISBURSEMENT_ACTION_CODES = [
  'CREATE',
  'READ',
  'UPDATE',
  'DELETE',
  'POST',
  'CANCEL',
] as const;

type CrudPermissions = {
  readonly VIEW: string;
  readonly CREATE: string;
  readonly UPDATE: string;
  readonly DELETE: string;
};

/**
 * แปลง permission constant ของโมดูล (VIEW/CREATE/UPDATE/DELETE)
 * ให้เป็น map ตาม action code ในตาราง iam.actions ซึ่งใช้ READ แทน VIEW
 */
function fromCrud(permissions: CrudPermissions): Record<string, string> {
  return {
    CREATE: permissions.CREATE,
    READ: permissions.VIEW,
    UPDATE: permissions.UPDATE,
    DELETE: permissions.DELETE,
  };
}

/**
 * เมนูที่ permission code ไม่ตรงกับรูปแบบ `${menuCode}_${actionCode}`
 * เมนูที่ไม่อยู่ในนี้จะใช้รูปแบบเริ่มต้น
 */
export const MENU_PERMISSION_REGISTRY: Readonly<
  Record<string, Readonly<Record<string, string>>>
> = {
  MATERIALS_MANAGEMENTS: fromCrud(MATERIAL_PERMISSIONS),
  UNIT_MANAGEMENT: fromCrud(UNIT_PERMISSIONS),
  SUPPLIER_MANAGEMENT: fromCrud(SUPPLIER_PERMISSIONS),
  MATERIAL_MODEL_MANAGEMENT: fromCrud(MATERIAL_MODEL_PERMISSIONS),
  DELIVERY_TYPE_MANAGEMENT: fromCrud(DELIVERY_TYPE_PERMISSIONS),
  LOADING_POINT_MANAGEMENT: fromCrud(LOADING_POINT_PERMISSIONS),
  CATEGORY_MANAGEMENT: fromCrud(CATEGORY_PERMISSIONS),
  STATUS_ITEM_MANAGEMENT: fromCrud(STATUS_ITEM_PERMISSIONS),
  ORGANIZATION_MANAGEMENT: fromCrud(ORGANIZATION_PERMISSIONS),
  REJECT_REASON_MANAGEMENT: fromCrud(REJECT_REASON_PERMISSIONS),
  MATERIALS_RECEIVING: {
    ...fromCrud(MATERIALS_RECEIVING_PERMISSIONS),
    POST: MATERIALS_RECEIVING_PERMISSIONS.CONFIRM,
    CANCEL: MATERIALS_RECEIVING_PERMISSIONS.CANCEL,
  },
  MATERIALS_DISBURSEMENT: {
    ...fromCrud(MATERIALS_DISBURSEMENT_PERMISSIONS),
    POST: MATERIALS_DISBURSEMENT_PERMISSIONS.CONFIRM,
    CANCEL: MATERIALS_DISBURSEMENT_PERMISSIONS.CANCEL,
  },
  // Report menus — read-only (VIEW only)
  MATERIALS_RECEIVING_REPORT: {
    READ: `${MATERIALS_RECEIVING_PERMISSIONS.VIEW}`,
  },
  MATERIALS_DISBURSEMENT_REPORT: {
    READ: `${MATERIALS_DISBURSEMENT_PERMISSIONS.VIEW}`,
  },
  // Unified materials stock report — read-only
  MATERIALS_REPORT: {
    READ: `${MATERIALS_RECEIVING_PERMISSIONS.VIEW}`,
  },
  // Products (automotive parts) — standard CRUD + RESTORE
  PRODUCTS_LIST: {
    CREATE: PRODUCTS_PERMISSIONS.CREATE,
    READ: PRODUCTS_PERMISSIONS.VIEW,
    UPDATE: PRODUCTS_PERMISSIONS.UPDATE,
    DELETE: PRODUCTS_PERMISSIONS.DELETE,
  },
  // BOMs — has extra ACTIVATE/DEACTIVATE actions on top of CRUD
  BOMS: {
    CREATE: BOMS_PERMISSIONS.CREATE,
    READ: BOMS_PERMISSIONS.VIEW,
    UPDATE: BOMS_PERMISSIONS.UPDATE,
    DELETE: BOMS_PERMISSIONS.DELETE,
  },
};

/** เมนูที่ต้องการ action นอกเหนือจากชุดเริ่มต้น */
export const MENU_ACTION_CODES: Readonly<Record<string, readonly string[]>> = {
  MATERIALS_RECEIVING: MATERIALS_RECEIVING_ACTION_CODES,
  MATERIALS_DISBURSEMENT: MATERIALS_DISBURSEMENT_ACTION_CODES,
  // Report menus — read-only
  MATERIALS_RECEIVING_REPORT: ['READ'],
  MATERIALS_DISBURSEMENT_REPORT: ['READ'],
  MATERIALS_REPORT: ['READ'],
  // Products/BOMs (standard CRUD)
  PRODUCTS_LIST: DEFAULT_ACTION_CODES,
  BOMS: DEFAULT_ACTION_CODES,
};

export function resolveActionCodes(menuCode: string): readonly string[] {
  return MENU_ACTION_CODES[menuCode] ?? DEFAULT_ACTION_CODES;
}

export function resolvePermissionCode(
  menuCode: string,
  actionCode: string,
): string {
  return (
    MENU_PERMISSION_REGISTRY[menuCode]?.[actionCode] ??
    `${menuCode}_${actionCode}`
  );
}
