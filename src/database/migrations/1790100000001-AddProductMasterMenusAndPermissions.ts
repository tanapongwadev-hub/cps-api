import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductMasterMenusAndPermissions1790100000001 implements MigrationInterface {
  name = 'AddProductMasterMenusAndPermissions1790100000001';

  private readonly resources = [
    {
      menuCode: 'PRODUCT_TYPE_MANAGEMENT',
      nameTh: 'จัดการประเภทสินค้า',
      nameEn: 'Product Type Management',
      path: '/master-data/product-types',
      icon: 'tag',
      permPrefix: 'PRODUCT_TYPE',
      sortOrder: 10,
    },
    {
      menuCode: 'PRODUCT_MODEL_MANAGEMENT',
      nameTh: 'จัดการรุ่นสินค้า',
      nameEn: 'Product Model Management',
      path: '/master-data/product-models',
      icon: 'car',
      permPrefix: 'PRODUCT_MODEL',
      sortOrder: 11,
    },
    {
      menuCode: 'CUSTOMER_MANAGEMENT',
      nameTh: 'จัดการลูกค้า',
      nameEn: 'Customer Management',
      path: '/master-data/customers',
      icon: 'users',
      permPrefix: 'CUSTOMER',
      sortOrder: 12,
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
    // Resolve parent menu by code, not by hardcoded id, to stay safe against
    // any future renumbering of iam.menus rows. The "จัดการข้อมูลหลัก"
    // (MASTER DATA) parent menu is a `menu_type: 'MAIN'` row whose
    // `code = 'MASTER DATA'` and is the parent_id of every existing simple
    // master submenu (UNIT_MANAGEMENT, SUPPLIER_MANAGEMENT, ...).
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
        // Defensive — if a prior partial run already created the menu, skip
        // it rather than 23505 unique-violating. Mirrors the same idempotent
        // pattern MaterialsPcOverviewMenu uses for its `MATERIALS_PC_OVERVIEW`
        // row.
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
