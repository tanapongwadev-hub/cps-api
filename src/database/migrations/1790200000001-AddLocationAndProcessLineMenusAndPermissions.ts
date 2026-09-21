import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLocationAndProcessLineMenusAndPermissions1790200000001
  implements MigrationInterface
{
  name = 'AddLocationAndProcessLineMenusAndPermissions1790200000001';

  // Same two-migration pattern as PRODUCT_TYPE/PRODUCT_MODEL/CUSTOMER
  // (see 1790100000001-AddProductMasterMenusAndPermissions.ts) — Location and
  // ProcessLine are two more simple-master entities that were created early
  // (1786700000005-RebuildProductsAndAddMasters.ts, as plain FK lookup tables
  // for Product.locationId/processLineId) but never got their own admin CRUD
  // menu/permission rows. sortOrder continues the same MASTER DATA block the
  // product-master trio used (10/11/12), taking the next two free numbers.
  private readonly resources = [
    {
      menuCode: 'LOCATION_MANAGEMENT',
      nameTh: 'จัดการสถานที่',
      nameEn: 'Location Management',
      path: '/master-data/locations',
      // 'map-pin' is already mapped in admin-dashboard/src/lib/menu-icons.ts
      // (used elsewhere for LOADING_POINT_MANAGEMENT) — reused here rather
      // than minting a new icon name, since "place" is the same concept.
      icon: 'map-pin',
      permPrefix: 'LOCATION',
      sortOrder: 13,
    },
    {
      menuCode: 'PROCESS_LINE_MANAGEMENT',
      nameTh: 'จัดการสายการผลิต',
      nameEn: 'Process Line Management',
      path: '/master-data/process-lines',
      // 'git-branch' is already mapped in admin-dashboard/src/lib/menu-icons.ts
      // — reused for its "branching flow" shape rather than adding a new
      // icon-map entry just for this resource.
      icon: 'git-branch',
      permPrefix: 'PROCESS_LINE',
      sortOrder: 14,
    },
  ];

  // Permission-code suffix -> the iam.actions.code it actually maps to.
  // 'VIEW' is a display-only label; the underlying shared action row is 'READ'.
  private readonly verbToActionCode: Record<string, string> = {
    VIEW: 'READ',
    CREATE: 'CREATE',
    UPDATE: 'UPDATE',
    DELETE: 'DELETE',
  };

  async up(queryRunner: QueryRunner): Promise<void> {
    // Resolve parent menu by code, not by hardcoded id — same reasoning as
    // AddProductMasterMenusAndPermissions.
    const parent = await queryRunner.query(
      `SELECT id FROM iam.menus WHERE code = 'MASTER DATA' AND menu_type = 'MAIN'`,
    );
    if (parent.length === 0) {
      throw new Error(
        "'MASTER DATA' parent menu not found — run the base seed before this migration",
      );
    }
    const parentId = parent[0].id;

    const actionIdByCode: Record<string, string> = {};
    for (const actionCode of ['READ', 'CREATE', 'UPDATE', 'DELETE']) {
      const rows = await queryRunner.query(
        `SELECT id FROM iam.actions WHERE code = $1`,
        [actionCode],
      );
      if (rows.length === 0) {
        throw new Error(`iam.actions row for '${actionCode}' not found`);
      }
      actionIdByCode[actionCode] = rows[0].id;
    }

    for (const r of this.resources) {
      const existingMenu = await queryRunner.query(
        `SELECT id FROM iam.menus WHERE code = $1`,
        [r.menuCode],
      );
      if (existingMenu.length > 0) {
        continue;
      }

      const menu = await queryRunner.query(
        `INSERT INTO iam.menus (parent_id, code, name_th, name_en, path, icon, menu_type, sort_order, is_active, is_visible, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'SUB', $7, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         RETURNING id`,
        [parentId, r.menuCode, r.nameTh, r.nameEn, r.path, r.icon, r.sortOrder],
      );
      const menuId = menu[0].id;

      for (const [verb, actionCode] of Object.entries(this.verbToActionCode)) {
        await queryRunner.query(
          `INSERT INTO iam.permissions (menu_id, action_id, code, description, is_active, created_at, updated_at)
           VALUES ($1, $2, $3, $4, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          [
            menuId,
            actionIdByCode[actionCode],
            `${r.permPrefix}_${verb}`,
            `${r.nameTh} — ${verb}`,
          ],
        );
      }
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const r of this.resources) {
      await queryRunner.query(
        `DELETE FROM iam.permissions WHERE code LIKE $1`,
        [`${r.permPrefix}_%`],
      );
      await queryRunner.query(`DELETE FROM iam.menus WHERE code = $1`, [
        r.menuCode,
      ]);
    }
  }
}
