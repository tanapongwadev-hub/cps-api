import { CATEGORY_PERMISSIONS } from '../../modules/categories/category-permissions';
import { DELIVERY_TYPE_PERMISSIONS } from '../../modules/delivery-types/delivery-type-permissions';
import { GOODS_RECEIPT_PERMISSIONS } from '../../modules/goods-receipts/goods-receipt-permissions';
import { LOADING_POINT_PERMISSIONS } from '../../modules/loading-points/loading-point-permissions';
import { MATERIAL_MODEL_PERMISSIONS } from '../../modules/material-models/material-model-permissions';
import { MATERIAL_PERMISSIONS } from '../../modules/materials/material-permissions';
import { ORGANIZATION_PERMISSIONS } from '../../modules/organizations/organization-permissions';
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
  GOODS_RECEIPT: {
    ...fromCrud(GOODS_RECEIPT_PERMISSIONS),
    POST: GOODS_RECEIPT_PERMISSIONS.POST,
    CANCEL: GOODS_RECEIPT_PERMISSIONS.CANCEL,
  },
};

/** เมนูที่ต้องการ action นอกเหนือจากชุดเริ่มต้น */
export const MENU_ACTION_CODES: Readonly<Record<string, readonly string[]>> = {
  GOODS_RECEIPT: DOCUMENT_ACTION_CODES,
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
