import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { MATERIAL_PERMISSIONS } from '../../modules/materials/material-permissions';
import { UNIT_PERMISSIONS } from '../../modules/units/unit-permissions';
import { SUPPLIER_PERMISSIONS } from '../../modules/suppliers/supplier-permissions';
import { MATERIAL_MODEL_PERMISSIONS } from '../../modules/material-models/material-model-permissions';
import { DELIVERY_TYPE_PERMISSIONS } from '../../modules/delivery-types/delivery-type-permissions';
import { LOADING_POINT_PERMISSIONS } from '../../modules/loading-points/loading-point-permissions';
import { CATEGORY_PERMISSIONS } from '../../modules/categories/category-permissions';
import { STATUS_ITEM_PERMISSIONS } from '../../modules/status-items/status-item-permissions';
import { ORGANIZATION_PERMISSIONS } from '../../modules/organizations/organization-permissions';

export async function seed(dataSource: DataSource) {
  const configService = new ConfigService();

  console.log('🌱 Starting database seed...');

  // Get query runner
  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    // Seed Actions
    console.log('Seeding actions...');
    const actions = [
      { code: 'CREATE', name_th: 'สร้าง', name_en: 'Create', sort_order: 1 },
      { code: 'READ', name_th: 'อ่าน', name_en: 'Read', sort_order: 2 },
      { code: 'UPDATE', name_th: 'แก้ไข', name_en: 'Update', sort_order: 3 },
      { code: 'DELETE', name_th: 'ลบ', name_en: 'Delete', sort_order: 4 },
    ];

    for (const action of actions) {
      const existing = await queryRunner.query(
        `SELECT id FROM iam.actions WHERE code = $1`,
        [action.code],
      );

      if (existing.length === 0) {
        await queryRunner.query(
          `INSERT INTO iam.actions (code, name_th, name_en, sort_order, is_system, is_active, created_at, updated_at) 
           VALUES ($1, $2, $3, $4, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          [action.code, action.name_th, action.name_en, action.sort_order],
        );
        console.log(`  ✓ Created action: ${action.code}`);
      } else {
        console.log(`  - Action already exists: ${action.code}`);
      }
    }

    // Seed Roles
    console.log('Seeding roles...');
    const roles = [
      {
        code: 'SUPER_ADMIN',
        name_th: 'ผู้ดูแลระบบสูงสุด',
        name_en: 'Super Admin',
        scope_type: 'SYSTEM',
      },
      {
        code: 'ADMIN',
        name_th: 'ผู้ดูแลระบบ',
        name_en: 'Admin',
        scope_type: 'DEPARTMENT',
      },
      {
        code: 'USER',
        name_th: 'ผู้ใช้งาน',
        name_en: 'User',
        scope_type: 'DEPARTMENT',
      },
    ];

    for (const role of roles) {
      const existing = await queryRunner.query(
        `SELECT id FROM iam.roles WHERE code = $1`,
        [role.code],
      );

      if (existing.length === 0) {
        await queryRunner.query(
          `INSERT INTO iam.roles (code, name_th, name_en, scope_type, is_system, is_active, created_at, updated_at) 
           VALUES ($1, $2, $3, $4, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          [role.code, role.name_th, role.name_en, role.scope_type],
        );
        console.log(`  ✓ Created role: ${role.code}`);
      } else {
        console.log(`  - Role already exists: ${role.code}`);
      }
    }

    // Seed Role Actions
    console.log('Seeding role actions...');
    const roleActions = [
      // SUPER_ADMIN gets all actions
      { role_code: 'SUPER_ADMIN', action_code: 'CREATE' },
      { role_code: 'SUPER_ADMIN', action_code: 'READ' },
      { role_code: 'SUPER_ADMIN', action_code: 'UPDATE' },
      { role_code: 'SUPER_ADMIN', action_code: 'DELETE' },
      // ADMIN gets all actions
      { role_code: 'ADMIN', action_code: 'CREATE' },
      { role_code: 'ADMIN', action_code: 'READ' },
      { role_code: 'ADMIN', action_code: 'UPDATE' },
      { role_code: 'ADMIN', action_code: 'DELETE' },
      // USER gets CREATE, READ, UPDATE only
      { role_code: 'USER', action_code: 'CREATE' },
      { role_code: 'USER', action_code: 'READ' },
      { role_code: 'USER', action_code: 'UPDATE' },
    ];

    for (const ra of roleActions) {
      const existing = await queryRunner.query(
        `SELECT ra.id FROM iam.role_actions ra 
         INNER JOIN iam.roles r ON ra.role_id = r.id 
         INNER JOIN iam.actions a ON ra.action_id = a.id 
         WHERE r.code = $1 AND a.code = $2`,
        [ra.role_code, ra.action_code],
      );

      if (existing.length === 0) {
        await queryRunner.query(
          `INSERT INTO iam.role_actions (role_id, action_id, is_active, created_at, updated_at)
           SELECT r.id, a.id, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
           FROM iam.roles r, iam.actions a
           WHERE r.code = $1 AND a.code = $2`,
          [ra.role_code, ra.action_code],
        );
        console.log(
          `  ✓ Created role action: ${ra.role_code} - ${ra.action_code}`,
        );
      } else {
        console.log(
          `  - Role action already exists: ${ra.role_code} - ${ra.action_code}`,
        );
      }
    }

    // Seed Departments
    console.log('Seeding departments...');
    const departments = [
      { code: 'WE', name_th: 'แผนก WE', name_en: 'WE Department' },
      { code: 'PS', name_th: 'แผนก PS', name_en: 'PS Department' },
    ];

    for (const dept of departments) {
      const existing = await queryRunner.query(
        `SELECT id FROM iam.departments WHERE code = $1`,
        [dept.code],
      );

      if (existing.length === 0) {
        await queryRunner.query(
          `INSERT INTO iam.departments (code, name_th, name_en, is_active, created_at, updated_at) 
           VALUES ($1, $2, $3, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          [dept.code, dept.name_th, dept.name_en],
        );
        console.log(`  ✓ Created department: ${dept.code}`);
      } else {
        console.log(`  - Department already exists: ${dept.code}`);
      }
    }

    // Seed Menus
    console.log('Seeding menus...');
    const menus = [
      {
        code: 'DASHBOARD',
        name_th: 'แดชบอร์ด',
        name_en: 'Dashboard',
        path: '/dashboard',
        icon: 'dashboard',
        sort_order: 1,
      },
      {
        code: 'USER_MANAGEMENT',
        name_th: 'จัดการผู้ใช้งาน',
        name_en: 'User Management',
        path: '/users',
        icon: 'users',
        sort_order: 10,
      },
      {
        code: 'DEPARTMENT_MANAGEMENT',
        name_th: 'จัดการแผนก',
        name_en: 'Department Management',
        path: '/departments',
        icon: 'building',
        sort_order: 20,
      },
      {
        code: 'ROLE_MANAGEMENT',
        name_th: 'จัดการบทบาท',
        name_en: 'Role Management',
        path: '/roles',
        icon: 'shield',
        sort_order: 30,
      },
      {
        code: 'MENU_MANAGEMENT',
        name_th: 'จัดการเมนู',
        name_en: 'Menu Management',
        path: '/menus',
        icon: 'menu',
        sort_order: 40,
      },
      {
        code: 'PERMISSION_MANAGEMENT',
        name_th: 'จัดการสิทธิ์',
        name_en: 'Permission Management',
        path: '/permissions',
        icon: 'key',
        sort_order: 50,
      },
      {
        code: 'SESSION_MANAGEMENT',
        name_th: 'จัดการเซสชัน',
        name_en: 'Session Management',
        path: '/sessions',
        icon: 'clock',
        sort_order: 60,
      },
      {
        code: 'AUDIT_LOG',
        name_th: 'บันทึกการใช้งาน',
        name_en: 'Audit Log',
        path: '/audit-logs',
        icon: 'file-text',
        sort_order: 70,
      },
      {
        code: 'MATERIALS_MANAGEMENTS',
        name_th: 'จัดการวัสดุ',
        name_en: 'Materials Management',
        path: '/materials',
        icon: 'package',
        sort_order: 80,
      },
      {
        code: 'UNIT_MANAGEMENT',
        name_th: 'จัดการหน่วยนับ',
        name_en: 'Unit Management',
        path: '/master-data/units',
        icon: 'ruler',
        sort_order: 90,
      },
      {
        code: 'SUPPLIER_MANAGEMENT',
        name_th: 'จัดการผู้จัดจำหน่าย',
        name_en: 'Supplier Management',
        path: '/master-data/suppliers',
        icon: 'truck',
        sort_order: 91,
      },
      {
        code: 'MATERIAL_MODEL_MANAGEMENT',
        name_th: 'จัดการรุ่นวัสดุ',
        name_en: 'Material Model Management',
        path: '/master-data/material-models',
        icon: 'box',
        sort_order: 92,
      },
      {
        code: 'DELIVERY_TYPE_MANAGEMENT',
        name_th: 'จัดการประเภทการจัดส่ง',
        name_en: 'Delivery Type Management',
        path: '/master-data/delivery-types',
        icon: 'truck',
        sort_order: 93,
      },
      {
        code: 'LOADING_POINT_MANAGEMENT',
        name_th: 'จัดการจุดขนถ่าย',
        name_en: 'Loading Point Management',
        path: '/master-data/loading-points',
        icon: 'map-pin',
        sort_order: 94,
      },
      {
        code: 'CATEGORY_MANAGEMENT',
        name_th: 'จัดการหมวดหมู่',
        name_en: 'Category Management',
        path: '/master-data/categories',
        icon: 'folder-tree',
        sort_order: 95,
      },
      {
        code: 'STATUS_ITEM_MANAGEMENT',
        name_th: 'จัดการสถานะ',
        name_en: 'Status Item Management',
        path: '/master-data/statuses',
        icon: 'tag',
        sort_order: 96,
      },
      {
        code: 'ORGANIZATION_MANAGEMENT',
        name_th: 'จัดการองค์กร',
        name_en: 'Organization Management',
        path: '/master-data/organizations',
        icon: 'building',
        sort_order: 97,
      },
    ];

    const menuIdMap: Record<string, string> = {};
    for (const menu of menus) {
      const existing = await queryRunner.query(
        `SELECT id FROM iam.menus WHERE code = $1`,
        [menu.code],
      );

      if (existing.length === 0) {
        const result = await queryRunner.query(
          `INSERT INTO iam.menus (code, name_th, name_en, menu_type, path, icon, sort_order, is_visible, is_active, created_at, updated_at) 
           VALUES ($1, $2, $3, 'MAIN', $4, $5, $6, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) 
           RETURNING id`,
          [
            menu.code,
            menu.name_th,
            menu.name_en,
            menu.path,
            menu.icon,
            menu.sort_order,
          ],
        );
        menuIdMap[menu.code] = result[0].id;
        console.log(`  ✓ Created menu: ${menu.code}`);
      } else {
        menuIdMap[menu.code] = existing[0].id;
        console.log(`  - Menu already exists: ${menu.code}`);
      }
    }

    // Seed Permissions for all menus x actions
    console.log('Seeding permissions...');
    const actionCodes = ['CREATE', 'READ', 'UPDATE', 'DELETE'];
    const actionIdMap: Record<string, string> = {};
    for (const code of actionCodes) {
      const result = await queryRunner.query(
        `SELECT id FROM iam.actions WHERE code = $1`,
        [code],
      );
      if (result.length > 0) {
        actionIdMap[code] = result[0].id;
      }
    }

    for (const menu of menus) {
      const menuId = menuIdMap[menu.code];
      for (const actionCode of actionCodes) {
        const actionId = actionIdMap[actionCode];
        if (!actionId) continue;

        const permissionCode =
          menu.code === 'MATERIALS_MANAGEMENTS'
            ? {
                CREATE: MATERIAL_PERMISSIONS.CREATE,
                READ: MATERIAL_PERMISSIONS.VIEW,
                UPDATE: MATERIAL_PERMISSIONS.UPDATE,
                DELETE: MATERIAL_PERMISSIONS.DELETE,
              }[actionCode]
            : menu.code === 'UNIT_MANAGEMENT'
              ? {
                  CREATE: UNIT_PERMISSIONS.CREATE,
                  READ: UNIT_PERMISSIONS.VIEW,
                  UPDATE: UNIT_PERMISSIONS.UPDATE,
                  DELETE: UNIT_PERMISSIONS.DELETE,
                }[actionCode]
              : menu.code === 'SUPPLIER_MANAGEMENT'
                ? {
                    CREATE: SUPPLIER_PERMISSIONS.CREATE,
                    READ: SUPPLIER_PERMISSIONS.VIEW,
                    UPDATE: SUPPLIER_PERMISSIONS.UPDATE,
                    DELETE: SUPPLIER_PERMISSIONS.DELETE,
                  }[actionCode]
                : menu.code === 'MATERIAL_MODEL_MANAGEMENT'
                  ? {
                      CREATE: MATERIAL_MODEL_PERMISSIONS.CREATE,
                      READ: MATERIAL_MODEL_PERMISSIONS.VIEW,
                      UPDATE: MATERIAL_MODEL_PERMISSIONS.UPDATE,
                      DELETE: MATERIAL_MODEL_PERMISSIONS.DELETE,
                    }[actionCode]
                  : menu.code === 'DELIVERY_TYPE_MANAGEMENT'
                    ? {
                        CREATE: DELIVERY_TYPE_PERMISSIONS.CREATE,
                        READ: DELIVERY_TYPE_PERMISSIONS.VIEW,
                        UPDATE: DELIVERY_TYPE_PERMISSIONS.UPDATE,
                        DELETE: DELIVERY_TYPE_PERMISSIONS.DELETE,
                      }[actionCode]
                    : menu.code === 'LOADING_POINT_MANAGEMENT'
                      ? {
                          CREATE: LOADING_POINT_PERMISSIONS.CREATE,
                          READ: LOADING_POINT_PERMISSIONS.VIEW,
                          UPDATE: LOADING_POINT_PERMISSIONS.UPDATE,
                          DELETE: LOADING_POINT_PERMISSIONS.DELETE,
                        }[actionCode]
                      : menu.code === 'CATEGORY_MANAGEMENT'
                        ? {
                            CREATE: CATEGORY_PERMISSIONS.CREATE,
                            READ: CATEGORY_PERMISSIONS.VIEW,
                            UPDATE: CATEGORY_PERMISSIONS.UPDATE,
                            DELETE: CATEGORY_PERMISSIONS.DELETE,
                          }[actionCode]
                        : menu.code === 'STATUS_ITEM_MANAGEMENT'
                          ? {
                              CREATE: STATUS_ITEM_PERMISSIONS.CREATE,
                              READ: STATUS_ITEM_PERMISSIONS.VIEW,
                              UPDATE: STATUS_ITEM_PERMISSIONS.UPDATE,
                              DELETE: STATUS_ITEM_PERMISSIONS.DELETE,
                            }[actionCode]
                          : menu.code === 'ORGANIZATION_MANAGEMENT'
                            ? {
                                CREATE: ORGANIZATION_PERMISSIONS.CREATE,
                                READ: ORGANIZATION_PERMISSIONS.VIEW,
                                UPDATE: ORGANIZATION_PERMISSIONS.UPDATE,
                                DELETE: ORGANIZATION_PERMISSIONS.DELETE,
                              }[actionCode]
                            : `${menu.code}_${actionCode}`;
        const existing = await queryRunner.query(
          `SELECT id FROM iam.permissions WHERE code = $1`,
          [permissionCode],
        );

        if (existing.length === 0) {
          await queryRunner.query(
            `INSERT INTO iam.permissions (menu_id, action_id, code, is_active, created_at, updated_at) 
             VALUES ($1, $2, $3, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
            [menuId, actionId, permissionCode],
          );
          console.log(`  ✓ Created permission: ${permissionCode}`);
        } else {
          console.log(`  - Permission already exists: ${permissionCode}`);
        }
      }
    }

    // Seed Initial Super Admin
    console.log('Seeding initial super admin...');
    const superAdminUsername = configService.get(
      'INITIAL_SUPER_ADMIN_USERNAME',
      'superadmin',
    );
    const superAdminPassword = configService.get(
      'INITIAL_SUPER_ADMIN_PASSWORD',
      'change-me-secure-password',
    );
    const superAdminFirstName = configService.get(
      'INITIAL_SUPER_ADMIN_FIRST_NAME',
      'System',
    );
    const superAdminLastName = configService.get(
      'INITIAL_SUPER_ADMIN_LAST_NAME',
      'Administrator',
    );
    const superAdminEmail = configService.get(
      'INITIAL_SUPER_ADMIN_EMAIL',
      'superadmin@example.com',
    );

    const existingUser = await queryRunner.query(
      `SELECT id FROM iam.users WHERE username = $1`,
      [superAdminUsername],
    );

    if (existingUser.length === 0) {
      const passwordHash = await argon2.hash(superAdminPassword, {
        type: argon2.argon2id,
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 4,
      });

      const userResult = await queryRunner.query(
        `INSERT INTO iam.users (username, password_hash, first_name, last_name, email, is_active, is_locked, permission_version, created_at, updated_at) 
         VALUES ($1, $2, $3, $4, $5, true, false, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) 
         RETURNING id`,
        [
          superAdminUsername,
          passwordHash,
          superAdminFirstName,
          superAdminLastName,
          superAdminEmail,
        ],
      );

      const userId = userResult[0].id;

      // Assign SUPER_ADMIN role with NULL department
      await queryRunner.query(
        `INSERT INTO iam.user_department_roles (user_id, department_id, role_id, is_active, assigned_at, created_at, updated_at)
         SELECT $1, NULL, r.id, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
         FROM iam.roles r WHERE r.code = 'SUPER_ADMIN'`,
        [userId],
      );

      console.log(`  ✓ Created super admin user: ${superAdminUsername}`);

      if (superAdminPassword === 'change-me-secure-password') {
        console.log(
          '  ⚠️  WARNING: Using default super admin password. Please change it in production!',
        );
      }
    } else {
      console.log(`  - Super admin user already exists: ${superAdminUsername}`);
    }

    await queryRunner.commitTransaction();
    console.log('✅ Database seed completed successfully!');
  } catch (error) {
    await queryRunner.rollbackTransaction();
    console.error('❌ Seed failed:', error);
    throw error;
  } finally {
    await queryRunner.release();
  }
}

// Run seed if this file is executed directly
if (require.main === module) {
  const configService = new ConfigService();

  const dataSource = new DataSource({
    type: 'postgres',
    host: configService.get('DB_HOST', 'localhost'),
    port: configService.get('DB_PORT', 5432),
    username: configService.get('DB_USERNAME', 'postgres'),
    password: configService.get('DB_PASSWORD', '9203106'),
    database: configService.get('DB_DATABASE', 'cps_database'),
    schema: configService.get('DB_SCHEMA', 'iam'),
    synchronize: false,
    logging: true,
  });

  dataSource
    .initialize()
    .then(() => seed(dataSource))
    .then(() => {
      console.log('Seed completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Seed failed:', error);
      process.exit(1);
    });
}
