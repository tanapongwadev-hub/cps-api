import { CATEGORY_PERMISSIONS } from '../../modules/categories/category-permissions';
import { DELIVERY_TYPE_PERMISSIONS } from '../../modules/delivery-types/delivery-type-permissions';
import { LOADING_POINT_PERMISSIONS } from '../../modules/loading-points/loading-point-permissions';
import { MATERIAL_MODEL_PERMISSIONS } from '../../modules/material-models/material-model-permissions';
import { MATERIAL_PERMISSIONS } from '../../modules/materials/material-permissions';
import { ORGANIZATION_PERMISSIONS } from '../../modules/organizations/organization-permissions';
import { REJECT_REASON_PERMISSIONS } from '../../modules/reject-reasons/reject-reason-permissions';
import { STATUS_ITEM_PERMISSIONS } from '../../modules/status-items/status-item-permissions';
import { SUPPLIER_PERMISSIONS } from '../../modules/suppliers/supplier-permissions';
import { UNIT_PERMISSIONS } from '../../modules/units/unit-permissions';
import {
  DEFAULT_ACTION_CODES,
  resolveActionCodes,
  resolvePermissionCode,
} from './permission-registry';

/**
 * เมนูทั้งหมดที่ seed.ts สร้างก่อน refactor พร้อม permission code ที่ต้องได้
 * ใช้เป็นตัวยืนยันว่าการเปลี่ยนจาก ternary chain มาเป็น registry ไม่เปลี่ยนผลลัพธ์
 */
const LEGACY_MENU_CODES = [
  'DASHBOARD',
  'USER_MANAGEMENT',
  'DEPARTMENT_MANAGEMENT',
  'ROLE_MANAGEMENT',
  'MENU_MANAGEMENT',
  'PERMISSION_MANAGEMENT',
  'SESSION_MANAGEMENT',
  'AUDIT_LOG',
  'MATERIALS_MANAGEMENTS',
  'UNIT_MANAGEMENT',
  'SUPPLIER_MANAGEMENT',
  'MATERIAL_MODEL_MANAGEMENT',
  'DELIVERY_TYPE_MANAGEMENT',
  'LOADING_POINT_MANAGEMENT',
  'CATEGORY_MANAGEMENT',
  'STATUS_ITEM_MANAGEMENT',
  'ORGANIZATION_MANAGEMENT',
] as const;

/** ตรรกะเดิมที่ seed.ts ใช้ ก่อนแทนที่ด้วย registry */
function legacyPermissionCode(menuCode: string, actionCode: string): string {
  const mapped = (
    {
      MATERIALS_MANAGEMENTS: MATERIAL_PERMISSIONS,
      UNIT_MANAGEMENT: UNIT_PERMISSIONS,
      SUPPLIER_MANAGEMENT: SUPPLIER_PERMISSIONS,
      MATERIAL_MODEL_MANAGEMENT: MATERIAL_MODEL_PERMISSIONS,
      DELIVERY_TYPE_MANAGEMENT: DELIVERY_TYPE_PERMISSIONS,
      LOADING_POINT_MANAGEMENT: LOADING_POINT_PERMISSIONS,
      CATEGORY_MANAGEMENT: CATEGORY_PERMISSIONS,
      STATUS_ITEM_MANAGEMENT: STATUS_ITEM_PERMISSIONS,
      ORGANIZATION_MANAGEMENT: ORGANIZATION_PERMISSIONS,
    } as Record<
      string,
      { VIEW: string; CREATE: string; UPDATE: string; DELETE: string }
    >
  )[menuCode];
  if (!mapped) return `${menuCode}_${actionCode}`;
  return {
    CREATE: mapped.CREATE,
    READ: mapped.VIEW,
    UPDATE: mapped.UPDATE,
    DELETE: mapped.DELETE,
  }[actionCode] as string;
}

describe('permission registry', () => {
  it('keeps every legacy permission code unchanged after the refactor', () => {
    for (const menuCode of LEGACY_MENU_CODES) {
      for (const actionCode of DEFAULT_ACTION_CODES) {
        expect(resolvePermissionCode(menuCode, actionCode)).toBe(
          legacyPermissionCode(menuCode, actionCode),
        );
      }
    }
  });

  it('falls back to menuCode_actionCode for menus without a mapping', () => {
    expect(resolvePermissionCode('DASHBOARD', 'READ')).toBe('DASHBOARD_READ');
    expect(resolvePermissionCode('USER_MANAGEMENT', 'DELETE')).toBe(
      'USER_MANAGEMENT_DELETE',
    );
  });

  it('maps READ to the module VIEW permission', () => {
    expect(resolvePermissionCode('MATERIALS_MANAGEMENTS', 'READ')).toBe(
      MATERIAL_PERMISSIONS.VIEW,
    );
    expect(resolvePermissionCode('UNIT_MANAGEMENT', 'READ')).toBe(
      UNIT_PERMISSIONS.VIEW,
    );
  });

  it('gives every other menu only the CRUD action set', () => {
    for (const menuCode of LEGACY_MENU_CODES) {
      expect(resolveActionCodes(menuCode)).toEqual(DEFAULT_ACTION_CODES);
    }
    expect(resolveActionCodes('REJECT_REASON_MANAGEMENT')).toEqual(
      DEFAULT_ACTION_CODES,
    );
  });

  it('maps the reject reason menu to its module permissions', () => {
    expect(resolvePermissionCode('REJECT_REASON_MANAGEMENT', 'READ')).toBe(
      REJECT_REASON_PERMISSIONS.VIEW,
    );
    expect(resolvePermissionCode('REJECT_REASON_MANAGEMENT', 'CREATE')).toBe(
      REJECT_REASON_PERMISSIONS.CREATE,
    );
  });
});
