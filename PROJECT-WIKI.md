# CPS Access Control - Project Wiki

> **สำหรับ AI / Developer:** ก่อนแก้ไขโค้ดทุกครั้ง ให้อ่านไฟล์นี้ก่อน เพื่อให้แก้ไขสอดคล้องกับ architecture, conventions และ security practices ของโปรเจค

## 0. AI Developer Guide

### 0.1 Before making changes

- อ่าน `PROJECT-WIKI.md` (ไฟล์นี้) และ `API_ENDPOINTS.md`
- ตรวจสอบ module map และ dependency ก่อนเพิ่ม/แก้ service
- อย่า hardcode secrets / credentials / JWT defaults ใน source code
- ต้องใช้ `getEnv`, `getEnvNumber`, `getEnvBoolean` จาก `src/config/env.utils.ts` เมื่ออ่าน environment variable
- config ส่วนกลางอยู่ที่ `src/config/app.config.ts` และ `src/config/database.config.ts`

### 0.2 Conventions

- Controllers บางเบา วาง business logic ใน Services
- ใช้ DTO + `class-validator` สำหรับ request validation
- ใช้ custom exceptions จาก `src/common/exceptions/custom-exceptions.ts`
- Guards: `JwtAuthGuard`, `RolesGuard`, `PermissionGuard` อยู่ใน `src/common/guards`
- Decorators: `@Public()`, `@Roles(...)`, `@RequirePermissions(...)`, `@CurrentUser()` อยู่ใน `src/common/decorators`
- Entities อยู่ใน `src/entities/iam/*` และ `src/entities/master/*`
- TypeORM migrations อยู่ใน `src/database/migrations/*`
- Seeds อยู่ใน `src/database/seeds/*`

### 0.3 Forbidden patterns

- ห้ามใช้ default password/hardcoded secrets (เช่น `9203106`, `default-secret-key...`)
- ห้าม import `ConfigService` แล้วสร้าง `new ConfigService()` ใน standalone scripts
- ห้าม `enableCors()` แบบเปิดกว้างใน production (`CORS_ORIGIN` ต้องถูกตั้งค่า)
- ห้ามเรียก `db:reset` ใน production (`reset-database.ts` บล็อก `NODE_ENV=production` อยู่แล้ว)

## 1. ภาพรวมระบบ (System Overview)

CPS Access Control เป็นระบบจัดการสิทธิ์ผู้ใช้งาน (RBAC) บน NestJS + PostgreSQL รองรับการจัดการผู้ใช้ แผนก บทบาท เมนู สิทธิ์ เซสชัน และบันทึกการใช้งาน

### 1.1 Domain Requirement Documents

- [Material Master Requirements](docs/wiki/material-master.md) — ข้อมูลหลักวัตถุดิบ, Supplier และ Master Data ที่เกี่ยวข้อง

## 2. สถาปัตยกรรม (Architecture)

### 2.1 Tech Stack

- **Framework**: NestJS 11.x
- **Language**: TypeScript
- **ORM**: TypeORM 0.3.x
- **Database**: PostgreSQL 14+
- **Authentication**: JWT + Passport
- **Password Hashing**: Argon2
- **Documentation**: Swagger/OpenAPI
- **Configuration**: Centralized via `src/config/app.config.ts`, `src/config/database.config.ts`, and `src/config/env.utils.ts`
- **Schemas**: `iam` (Identity and Access Management) และ `master` (ข้อมูลหลักของระบบ)

### 2.2 Project Structure

```
cps-api/
├── src/
│   ├── modules/                    # Feature modules
│   │   ├── access-control/         # Cross-cutting permission calculation
│   │   ├── audit-logs/             # Audit logging
│   │   ├── auth/                   # Authentication & session management
│   │   ├── departments/            # Department management
│   │   ├── menus/                  # Menu hierarchy management
│   │   ├── permissions/            # Permission read-only
│   │   ├── roles/                  # Role management
│   │   ├── sessions/               # Session management
│   │   └── users/                  # User management
│   ├── entities/iam/               # IAM TypeORM entities (12 tables)
│   │   ├── actions.entity.ts
│   │   ├── audit-log.entity.ts
│   │   ├── auth-session.entity.ts
│   │   ├── department.entity.ts
│   │   ├── department-permission.entity.ts
│   │   ├── menu.entity.ts
│   │   ├── permission.entity.ts
│   │   ├── role-action.entity.ts
│   │   ├── role.entity.ts
│   │   ├── user-department-permission.entity.ts
│   │   ├── user-department-role.entity.ts
│   │   └── user.entity.ts
│   ├── entities/master/            # Material Master TypeORM entities (7 tables)
│   │   ├── delivery-type.entity.ts
│   │   ├── loading-point.entity.ts
│   │   ├── material-model.entity.ts
│   │   ├── material.entity.ts
│   │   ├── supplier-material.entity.ts
│   │   ├── supplier.entity.ts
│   │   └── unit.entity.ts
│   ├── database/                   # Database operations
│   │   ├── migrations/             # TypeORM migrations
│   │   ├── seeds/                  # Seed scripts
│   │   │   ├── create-super-admin.ts
│   │   │   └── seed.ts
│   │   ├── data-source.ts          # TypeORM DataSource config
│   │   └── reset-database.ts       # Development reset script
│   ├── config/                     # Configuration
│   │   ├── app.config.ts           # App-level config
│   │   ├── database.config.ts      # Database config
│   │   └── env.utils.ts            # Environment variable utilities
│   ├── common/                     # Shared utilities
│   │   ├── constants/              # Application constants
│   │   ├── decorators/             # Custom decorators (@Public, @Roles, etc.)
│   │   ├── dto/                    # Common DTOs
│   │   ├── enums/                  # Application enums
│   │   ├── exceptions/             # Custom exceptions
│   │   ├── guards/                 # Auth guards (JwtAuthGuard, RolesGuard, etc.)
│   │   ├── interceptors/           # Logging interceptor
│   │   ├── interfaces/             # TypeScript interfaces
│   │   └── pipes/                  # Validation pipes
│   ├── main.ts                     # Application bootstrap
│   └── app.module.ts               # Root module
├── dist/                           # Compiled output
├── node_modules/                   # Dependencies
├── .env.example                    # Environment variables template
├── .env                            # Actual environment variables (not committed)
├── .gitignore
├── nest-cli.json
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── PROJECT-WIKI.md                 # This file
└── API_ENDPOINTS.md                # API documentation
```

## 3. โมเดลข้อมูล (Data Model)

### 3.1 IAM Entities (12 tables)

| Table                         | คำอธิบาย                                         | ความสัมพันธ์                                     |
| ----------------------------- | ------------------------------------------------ | ------------------------------------------------ |
| `actions`                     | การกระทำที่อนุญาต (CREATE, READ, UPDATE, DELETE) | ถูกอ้างอิงโดย `permissions` และ `role_actions`   |
| `roles`                       | บทบาท (SUPER_ADMIN, ADMIN, USER)                 | มี `role_actions` และ `user_department_roles`    |
| `role_actions`                | ผูกบทบาทกับการกระทำ                              | Many-to-many ระหว่าง roles กับ actions           |
| `departments`                 | แผนก/หน่วยงาน                                    | ถูกอ้างอิงโดย `user_department_roles`            |
| `department_permissions`      | ผูกแผนกกับสิทธิ์ที่อนุญาต                        | Many-to-many ระหว่าง departments กับ permissions |
| `users`                       | ผู้ใช้งาน                                        | มี `user_department_roles`                       |
| `user_department_roles`       | ผูก user กับ role และ department                 | Core ของระบบ RBAC                                |
| `user_department_permissions` | สิทธิ์เฉพาะ user                                 | Override สิทธิ์จาก role                          |
| `menus`                       | เมนูในระบบ                                       | มี parent-child hierarchy                        |
| `permissions`                 | ผูก menu กับ action                              | ถูกอ้างอิงโดย `user_department_permissions`      |
| `auth_sessions`               | เซสชันการเข้าสู่ระบบ                             | เก็บ refresh token hash                          |
| `audit_logs`                  | บันทึกการกระทำสำคัญ                              | ตรวจสอบย้อนหลัง                                  |

### 3.2 ER Diagram (Textual)

```
users ──┬── user_department_roles ─── roles
        │              │
        │              └── departments
        │
        └── auth_sessions

roles ─── role_actions ─── actions
menus ─── permissions ─── actions
users ─── user_department_permissions ─── user_department_roles, permissions
```

### 3.3 Material Master Entities (7 tables)

| Table                       | คำอธิบาย                        | ความสัมพันธ์                                                          |
| --------------------------- | ------------------------------- | --------------------------------------------------------------------- |
| `master.materials`          | ข้อมูลหลักวัตถุดิบ              | อ้างอิงหน่วย รูปแบบจัดส่ง รุ่น จุดลงสินค้า และ Supplier ผ่านตารางกลาง |
| `master.units`              | หน่วยนับหลัก                    | หนึ่งหน่วยถูกใช้โดย Material ได้หลายรายการ                            |
| `master.delivery_types`     | รูปแบบการจัดส่ง                 | หนึ่งรูปแบบถูกใช้โดย Material ได้หลายรายการ                           |
| `master.material_models`    | รุ่นหรือแบบวัตถุดิบ             | หนึ่งรุ่นถูกใช้โดย Material ได้หลายรายการ                             |
| `master.loading_points`     | จุดรับหรือจุดลงวัตถุดิบ         | หนึ่งจุดถูกใช้โดย Material ได้หลายรายการ                              |
| `master.suppliers`          | ข้อมูลหลัก Supplier             | เชื่อมกับ Material ผ่าน `supplier_materials`                          |
| `master.supplier_materials` | ตารางกลาง Material และ Supplier | Unique ต่อคู่ `material_id`, `supplier_id`                            |

รายละเอียด requirement และข้อมูลที่อยู่นอกขอบเขตอยู่ใน [Material Master Requirements](docs/wiki/material-master.md)

## 4. กระบวนการเข้าสู่ระบบ (Authentication Flow)

### 4.1 Login

```
POST /auth/login
{
  "username": "superadmin",
  "password": "change-me-secure-password"
}
```

ขั้นตอน:

1. `AuthController.login()` รับ `LoginDto`
2. เรียก `AuthService.validateUser()`:
   - หา user จาก username
   - ตรวจสอบ isActive, isLocked
   - ตรวจสอบ password ด้วย argon2
   - รีเซ็ต failedLoginAttempts
3. เรียก `AuthService.login()`:
   - โหลด `user_department_roles` พร้อม department, role
   - กรอง assignments ที่ active (รวม NULL department สำหรับ superadmin)
   - ถ้าเป็น SUPER_ADMIN → generate tokens ทันที
   - ถ้ามี 1 assignment → auto-select
   - ถ้ามีหลาย assignment → คืน `requiresDepartmentSelection: true` + `departmentSelectionToken`
4. `generateTokens()`:
   - สร้าง `AuthSession`
   - sign accessToken และ refreshToken ด้วย JWT secrets
   - เก็บ refreshTokenHash ใน session

### 4.2 Department Selection

```
POST /auth/select-department
{
  "departmentSelectionToken": "...",
  "userDepartmentRoleId": "1"
}
```

ขั้นตอน:

1. `AuthController.selectDepartment()` verify `departmentSelectionToken` ด้วย `JWT_DEPARTMENT_SELECTION_SECRET`
2. ดึง `sub` (userId) จาก token
3. เรียก `AuthService.selectDepartment(userId, userDepartmentRoleId)`
4. ตรวจสอบ assignment ว่าเป็นของ user จริง และ active
5. generate tokens สำหรับ assignment นั้น

### 4.3 Switch Department

```
POST /auth/switch-department
Authorization: Bearer <accessToken>
{
  "userDepartmentRoleId": "2"
}
```

ขั้นตอน:

1. `JwtAuthGuard` verify accessToken
2. `CurrentUser` decorator ดึงข้อมูล user จาก `request.user`
3. `AuthController.switchDepartment()` ส่ง `user.id` และ `userDepartmentRoleId`
4. ทำงานเหมือน `selectDepartment`

### 4.4 Refresh Token

```
POST /auth/refresh
{
  "refreshToken": "..."
}
```

ขั้นตอน:

1. Verify refreshToken ด้วย `JWT_REFRESH_SECRET`
2. หา `AuthSession` จาก `sessionId` ในข้อมูล payload
3. ตรวจสอบ user ยัง active และไม่ locked
4. ตรวจสอบ `permissionVersion` ตรงกัน
5. Revoke session เก่า
6. generate tokens ใหม่
7. endpoint รองรับทั้ง `/auth/refresh` และ `/auth/refresh-token` (alias)

## 5. ระบบสิทธิ์ (Authorization / RBAC)

### 5.1 Role-Based Access Control

- **SUPER_ADMIN**: สิทธิ์ระดับระบบ ไม่ผูก department
- **ADMIN**: สิทธิ์ระดับแผนก ผูกกับ department หนึ่งแผนก
- **USER**: สิทธิ์ระดับแผนก ผูกกับ department หนึ่งแผนก

### 5.2 Permission Resolution

1. ดึง `role_actions` จาก role ของ user
2. ดึง `user_department_permissions` เพิ่มเติม/ยกเว้น
3. รวมกันเป็น set ของ permissions สำหรับ user ใน department นั้น

### 5.3 Guards

- `JwtAuthGuard`: ตรวจสอบ access token
- `Public`: อนุญาตให้เข้าถึงได้โดยไม่ต้อง login
- `@CurrentUser()`: ดึงข้อมูล user จาก JWT payload

## 6. Modules

### 6.0 Module Dependency Map

| Module              | Imports                                                                                                                                                                    | TypeORM Entities                                                                                                                  | Exports                                                                 | Controller              | บทบาทหลัก                                         |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------- | ------------------------------------------------- |
| AppModule           | ConfigModule, TypeOrmModule, AuthModule, UsersModule, DepartmentsModule, RolesModule, MenusModule, PermissionsModule, SessionsModule, AuditLogsModule, AccessControlModule, MaterialsModule, UnitsModule, SuppliersModule, CategoriesModule, DeliveryTypesModule, LoadingPointsModule, MaterialModelsModule, OrganizationsModule, StatusItemsModule | —                                                                                                                                 | —                                                                       | `AppController`         | Root module                                       |
| AuthModule          | AccessControlModule, TypeOrmModule, PassportModule, JwtModule                                                                                                              | User, UserDepartmentRole, UserDepartmentPermission, Department, Role, Action, RoleAction, Permission, Menu, AuthSession, AuditLog | `AuthService`                                                           | `AuthController`        | Login/logout/refresh/token + department selection |
| UsersModule         | TypeOrmModule                                                                                                                                                              | User, UserDepartmentRole, UserDepartmentPermission                                                                                | `UsersService`                                                          | `UsersController`       | จัดการผู้ใช้ + assignments                        |
| DepartmentsModule   | TypeOrmModule                                                                                                                                                              | Department                                                                                                                        | `DepartmentsService`                                                    | `DepartmentsController` | จัดการแผนก                                        |
| RolesModule         | TypeOrmModule                                                                                                                                                              | Role                                                                                                                              | `RolesService`                                                          | `RolesController`       | จัดการบทบาท                                       |
| MenusModule         | TypeOrmModule                                                                                                                                                              | Menu, Permission, Action                                                                                                          | `MenusService`                                                          | `MenusController`       | จัดการเมนู + tree                                 |
| PermissionsModule   | TypeOrmModule                                                                                                                                                              | Permission                                                                                                                        | `PermissionsService`                                                    | `PermissionsController` | CRUD สิทธิ์ + กำหนดแผนกที่ใช้ได้                 |
| SessionsModule      | TypeOrmModule                                                                                                                                                              | AuthSession                                                                                                                       | `SessionsService`                                                       | `SessionsController`    | จัดการ session / revoke                           |
| AuditLogsModule     | TypeOrmModule                                                                                                                                                              | AuditLog                                                                                                                          | `AuditLogsService`                                                      | `AuditLogsController`   | ดู audit logs                                     |
| AccessControlModule | TypeOrmModule                                                                                                                                                              | Permission, RoleAction, UserDepartmentRole, UserDepartmentPermission, Menu                                                        | `AccessControlService`, `EffectivePermissionService`, `MenuTreeService` | —                       | คำนวณสิทธิ์และเมนูที่ user ได้รับ                 |
| MaterialsModule     | AccessControlModule, TypeOrmModule                                                                                                                                         | Material, SupplierMaterial, Unit, DeliveryType, MaterialModel, LoadingPoint, Supplier                                             | `MaterialsService`, `MaterialImageStorageService`, `PermissionGuard`    | `MaterialsController`   | CRUD Material Master + จัดการรูปภาพ              |
| UnitsModule         | TypeOrmModule                                                                                                                                                              | Unit                                                                                                                              | `UnitsService`                                                          | `UnitsController`       | CRUD หน่วยนับ                                    |
| SuppliersModule     | TypeOrmModule                                                                                                                                                              | Supplier                                                                                                                          | `SuppliersService`                                                      | `SuppliersController`   | CRUD Supplier                                     |
| CategoriesModule    | TypeOrmModule                                                                                                                                                              | Category                                                                                                                          | `CategoriesService`                                                     | `CategoriesController`  | CRUD หมวดหมู่วัตถุดิบ                           |
| DeliveryTypesModule | TypeOrmModule                                                                                                                                                              | DeliveryType                                                                                                                      | `DeliveryTypesService`                                                  | `DeliveryTypesController` | CRUD รูปแบบการจัดส่ง                           |
| LoadingPointsModule | TypeOrmModule                                                                                                                                                              | LoadingPoint                                                                                                                      | `LoadingPointsService`                                                  | `LoadingPointsController` | CRUD จุดลงสินค้า                               |
| MaterialModelsModule | TypeOrmModule                                                                                                                                                             | MaterialModel                                                                                                                     | `MaterialModelsService`                                                 | `MaterialModelsController` | CRUD รุ่นวัตถุดิบ                            |
| OrganizationsModule  | TypeOrmModule                                                                                                                                                              | Organization                                                                                                                      | `OrganizationsService`                                                   | `OrganizationsController` | CRUD องค์กร                                    |
| StatusItemsModule  | TypeOrmModule                                                                                                                                                              | StatusItem                                                                                                                        | `StatusItemsService`                                                    | `StatusItemsController`  | CRUD รายการสถานะ                               |

### 6.1 AuthModule

- จัดการ login, logout, refresh, select/switch department
- ใช้ Passport Local Strategy และ JWT Strategy
- สร้างและจัดการ `AuthSession`

### 6.2 UsersModule

- CRUD ผู้ใช้งาน
- จัดการ `user_department_roles`
- รีเซ็ตรหัสผ่าน

### 6.3 DepartmentsModule

- CRUD แผนก

### 6.4 RolesModule

- CRUD บทบาท
- จัดการ `role_actions`

### 6.5 MenusModule

- CRUD เมนู
- รองรับ hierarchy (parent-child)

### 6.6 PermissionsModule

- CRUD permission + กำหนดแผนกที่ใช้ได้ (`PUT /permissions/:id/departments`)
- `GET /permissions/options` — ดึง menus + actions สำหรับ dropdown ในฟอร์มสร้าง/แก้ไข

### 6.7 SessionsModule

- ดูและ revoke เซสชัน

### 6.8 AuditLogsModule

- ดูบันทึกการกระทำ

### 6.9 AccessControlModule

- ไม่มี controller (cross-cutting service module)
- ให้บริการคำนวณสิทธิ์และเมนู:
  - `AccessControlService.getEffectivePermissionRows()` — รวมสิทธิ์จาก role + override
  - `EffectivePermissionService.getEffectivePermissionCodes()` — คืน permission codes ที่ active
  - `MenuTreeService.buildMenuTree()` — สร้างเมนู tree ตามสิทธิ์
- ถูก import โดย `AuthModule` เพื่อใช้ใน `AuthService.getMyMenus()` / `getMyPermissions()`
- หาก controller อื่นต้องการตรวจสิทธิ์ละเอียด ให้ import `AccessControlModule` และใช้ `PermissionGuard` พร้อม `@RequirePermissions(...)`

### 6.10 MaterialsModule

- CRUD Material Master ตาม [Material Master Requirements](docs/wiki/material-master.md)
- ใช้สิทธิ์จาก `MATERIAL_VIEW`, `MATERIAL_CREATE`, `MATERIAL_UPDATE`, `MATERIAL_DELETE` ผ่าน `PermissionGuard` (ดู `src/modules/materials/material-permissions.ts`)
- จัดการความสัมพันธ์กับ Lookup Master Data (Unit, DeliveryType, MaterialModel, LoadingPoint) และ Supplier ผ่านตารางกลาง `master.supplier_materials`
- ใช้ `DataSource.transaction()` ในการ create/update/deactivate/restore เพื่อรักษาความ consistent ของ material + supplier mappings
- ใช้ `pessimistic_write` lock ตอน update เพื่อป้องกัน concurrent write
- ใช้ optimistic concurrency ผ่าย `updatedAt` ใน `UpdateMaterialDto` (ถ้า `updatedAt` ไม่ตรงกัน → `409 Conflict`)
- Endpoint `POST /materials/images` ใช้ `MaterialImageStorageService` ทำสองขั้นตอน:
  1. `stage()` รับ multipart file แล้วเขียนลง `.tmp/` (เก็บ path ชั่วคราว 24 ชม.)
  2. `promote()` ย้ายไฟล์จาก `.tmp/` ไปยัง root เมื่อ create/update Material สำเร็จ
  3. `discard()` ลบไฟล์เก่าเมื่อมีการเปลี่ยนรูป หรือ compensate เมื่อ transaction fail
- `MaterialImageStorageService` validate MIME type, magic bytes (JPEG/PNG/WEBP), และขนาดไม่เกิน 5 MiB
- การลบ Material ใช้ soft delete ผ่าน `isActive = false` (เรียก `DELETE /materials/:id` → `PATCH /materials/:id/restore` เพื่อ restore)
- รายการ Material ใช้ query builder join กับ lookup + supplier mappings และกรองเฉพาะ active suppliers/mappings

### 6.11 UnitsModule

- CRUD หน่วยนับ (เช่น KG, PCS, L)
- ใช้สิทธิ์ `UNIT_VIEW/CREATE/UPDATE/DELETE` ผ่าน `PermissionGuard`

### 6.12 SuppliersModule

- CRUD ข้อมูลหลัก Supplier
- ใช้สิทธิ์ `SUPPLIER_VIEW/CREATE/UPDATE/DELETE` ผ่าน `PermissionGuard`

### 6.13 CategoriesModule

- CRUD หมวดหมู่วัตถุดิบ (รองรับ hierarchy ผ่าน `parentId`)
- ใช้สิทธิ์ `CATEGORY_VIEW/CREATE/UPDATE/DELETE` ผ่าน `PermissionGuard`

### 6.14 DeliveryTypesModule

- CRUD รูปแบบการจัดส่ง (เช่น รถบรรทุก, Tanker, Container)
- ใช้สิทธิ์ `DELIVERY_TYPE_VIEW/CREATE/UPDATE/DELETE` ผ่าน `PermissionGuard`

### 6.15 LoadingPointsModule

- CRUD จุดรับ/จุดลงวัตถุดิบ (เช่น Receiving Area A, Tank Farm)
- ใช้สิทธิ์ `LOADING_POINT_VIEW/CREATE/UPDATE/DELETE` ผ่าน `PermissionGuard`

### 6.16 MaterialModelsModule

- CRUD รุ่นหรือแบบวัตถุดิบ
- ใช้สิทธิ์ `MATERIAL_MODEL_VIEW/CREATE/UPDATE/DELETE` ผ่าน `PermissionGuard`

### 6.17 OrganizationsModule

- CRUD โครงสร้างองค์กร (headquarters/branch/subsidiary/department) รองรับ hierarchy ผ่าน `parentId`
- ใช้สิทธิ์ `ORGANIZATION_VIEW/CREATE/UPDATE/DELETE` ผ่าน `PermissionGuard`

### 6.18 StatusItemsModule

- CRUD รายการสถานะ (เช่น รอดำเนินการ, กำลังดำเนินการ, เสร็จสิ้น) พร้อม `color` และ `module` สำหรับจัดกลุ่ม
- ใช้สิทธิ์ `STATUS_ITEM_VIEW/CREATE/UPDATE/DELETE` ผ่าน `PermissionGuard`

## 7. Database Migration & Seeding

### 7.1 คำสั่งที่สำคัญ

```bash
pnpm db:reset        # ลบ schema iam และสร้างใหม่
pnpm migration:run   # รัน migrations
pnpm seed:run        # ใส่ข้อมูลเริ่มต้น
pnpm start:dev       # เริ่ม development server
```

### 7.2 Seed Data

- Actions: CREATE, READ, UPDATE, DELETE
- Roles: SUPER_ADMIN, ADMIN, USER
- Role Actions: SUPER_ADMIN/ADMIN ได้ทุก action, USER ได้ CREATE/READ/UPDATE
- Departments: WE, PS
- Initial Super Admin: username `superadmin` / password `change-me-secure-password`

## 8. Environment Variables

ดูรายละเอียดได้ที่ `.env.example`. การอ่าน env ทั้งหมดควรผ่าน `src/config/env.utils.ts`:

- `getEnv(key, default?)` — คืน `string`, throw ถ้าไม่มี default และไม่มีค่า
- `getEnvNumber(key, default?)` — คืน `number`, validate ว่าเป็นตัวเลข
- `getEnvBoolean(key, default?)` — คืน `boolean` (`true`/`1`)

Config ที่ใช้ประจำ:

| Config          | File                            | คำอธิบาย                                                                                     |
| --------------- | ------------------------------- | -------------------------------------------------------------------------------------------- |
| App config      | `src/config/app.config.ts`      | `NODE_ENV`, `PORT`, `CORS_ORIGIN`                                                            |
| Database config | `src/config/database.config.ts` | `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE`, `DB_SCHEMA`, `DB_LOGGING` |

สิ่งที่ต้องระวัง:

- `DB_PASSWORD` ไม่มี default แล้ว ต้อง set ใน `.env`
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_DEPARTMENT_SELECTION_SECRET` ไม่มี default (ใช้ `getOrThrow` ใน auth)
- `CORS_ORIGIN` ถ้าเว้นว่างจะอนุญาตทุก origin (`true`) — ห้ามทิ้งว่างใน production
- `MAX_FAILED_LOGIN_ATTEMPTS`, `ACCOUNT_LOCK_MINUTES` ใช้ `getEnvNumber` (default `5` และ `15` ตามลำดับ)

## 9. Logging

- Global HTTP logging interceptor บันทึกทุก request/response
- Debug logs ใน `AuthService.login` ช่วย trace ปัญหา department selection
- Logs ซ่อน sensitive fields (password, refreshToken)

## 10. API Testing

ไฟล์ `cps-api-collection.json` สามารถ import ใน Apidog/Postman ได้ มีตัวแปร:

- `baseUrl`
- `accessToken`
- `refreshToken`
- `departmentSelectionToken`

## 11. ข้อควรระวังใน Production

- เปลี่ยน JWT secrets ทั้งหมด
- เปลี่ยน default super admin password
- ตั้งค่า `DB_SYNCHRONIZE=false`
- ใช้ HTTPS
- ตั้งค่า CORS ให้เหมาะสม
- เก็บ logs และ audit logs อย่างปลอดภัย

## 12. Common Workflows

### 12.1 Local Development Setup

```bash
pnpm install
cp .env.example .env
# แก้ไข .env ให้ถูกต้อง (DB_PASSWORD, JWT secrets)
pnpm migration:run
pnpm seed:run
pnpm start:dev
```

### 12.2 Reset Database (สำหรับ development เท่านั้น)

```bash
pnpm db:reset
pnpm migration:run
pnpm seed:run
```

### 12.3 Generate a New Migration

```bash
pnpm migration:generate src/database/migrations/<MigrationName>
```

หรือสร้างด้วย TypeORM CLI:

```bash
pnpm exec typeorm migration:create src/database/migrations/<MigrationName>
```

### 12.4 Add a New Feature Module

1. สร้าง module ใหม่ใน `src/modules/<feature>/`
2. สร้าง `<feature>.module.ts`, `<feature>.service.ts`, `<feature>.controller.ts`, `dto/`
3. เพิ่ม TypeORM entities ที่ต้องใช้ใน `imports: [TypeOrmModule.forFeature([...])]`
4. เพิ่ม module ลง `AppModule` imports
5. อัปเดต `API_ENDPOINTS.md` และ `PROJECT-WIKI.md` ถ้ามีผลกระทบต่อ module map หรือ workflow

### 12.5 Add a New Environment Variable

1. เพิ่มใน `.env.example`
2. ถ้าเป็นค่าที่ใช้ทั่วไป ให้เพิ่มใน `src/config/app.config.ts` หรือ `src/config/database.config.ts`
3. อ่านผ่าน `getEnv` / `getEnvNumber` / `getEnvBoolean`
4. ห้าม hardcode default สำหรับ secrets/passwords

### 12.6 Standalone Scripts (migrations / seeds / reset)

- สคริปต์เหล่านี้ไม่ผ่าน `NestApplication` ดังนั้น `.env` จะถูกโหลดก็ต่อเมื่อ shell มี env อยู่แล้ว หรือใช้ `dotenv/config`
- อย่าสร้าง `new ConfigService()` เพื่ออ่าน env ให้ import `getDatabaseConfig()` / `getAppConfig()` จาก `src/config/*` แทน
- ดูตัวอย่างได้ที่ `src/database/data-source.ts` และ `src/database/reset-database.ts`
