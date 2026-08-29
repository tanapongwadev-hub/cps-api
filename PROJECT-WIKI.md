# CPS API — Project Wiki

> เอกสารนี้อ้างอิงโค้ดบน branch `develoment` ที่ตรวจถึงวันที่ 28 สิงหาคม 2026 (ฐานเดิม commit `b4114ab`) หากเอกสารขัดกับ controller, DTO, service, entity หรือ migration ให้ถือโค้ดเป็นแหล่งข้อมูลหลัก และอัปเดตเอกสารพร้อมการเปลี่ยนแปลงนั้น

## 1. ภาพรวมระบบ

`cps-api` เป็น REST API สำหรับระบบควบคุมสิทธิ์และงานวัตถุดิบ/การผลิต ใช้ NestJS 11, TypeScript, TypeORM และ PostgreSQL รองรับงานหลักดังนี้

- Authentication แบบ JWT access/refresh token และ session revocation
- RBAC แบบผู้ใช้มีหลาย assignment โดยแต่ละ assignment ผูก role กับ department
- Permission รายเมนู/การกระทำ พร้อม override รายผู้ใช้และขอบเขต department
- Material master, supplier mapping, รูปวัสดุ และข้อมูล master ที่เกี่ยวข้อง
- รับวัตถุดิบพร้อม lot, package, QR, stock balance และ stock transaction
- จ่ายวัตถุดิบแบบ FIFO พร้อมย้อน stock เมื่อยกเลิก
- Product master และ Bill of Materials (BOM) แบบ versioned
- Audit log, menu tree, session และ user administration

### 1.1 Runtime snapshot

| รายการ         | ค่า                                     |
| -------------- | --------------------------------------- |
| Framework      | NestJS `^11.0.1`                        |
| Language       | TypeScript `^5.7.3`                     |
| ORM            | TypeORM `^0.3.20`                       |
| Database       | PostgreSQL                              |
| Authentication | Passport JWT + Argon2id                 |
| Validation     | `class-validator` + `class-transformer` |
| API prefix     | `/api/v1`                               |
| Default port   | `3001`                                  |
| Swagger UI     | `/api/docs`                             |
| Main schemas   | `iam`, `master`, `inventory`            |

### 1.2 เอกสารที่เกี่ยวข้อง

- [API_ENDPOINTS.md](API_ENDPOINTS.md) — contract ของ route, permission, DTO และ response
- [Material Master Requirements](docs/wiki/material-master.md) — requirement เดิมของ Material Master
- [Goods Receipt Requirements](docs/wiki/goods-receipt.md) — เอกสาร historical; โมดูล `goods-receipts` ถูกถอดออกจาก runtime แล้ว

## 2. กฎสำหรับ Developer และ AI

### 2.1 ก่อนแก้ backend

1. อ่าน controller, DTO, service, entity และ test ของ module ที่จะแก้
2. ไล่ request path: route → guard → DTO → service → repository/entity → table
3. ตรวจ permission code ใน `*-permissions.ts` และ `permission-registry.ts`
4. รักษา `bigint` เป็น `string` และค่า `numeric` ทางธุรกิจเป็น decimal string เมื่อ code ปัจจุบันใช้รูปแบบนั้น
5. ใช้ transaction สำหรับงานหลายตาราง, stock, confirm/cancel, assignment aggregate และ BOM write
6. เพิ่ม migration ใหม่แทนการแก้ migration ที่ใช้งานแล้ว
7. อัปเดต Wiki/API docs เมื่อ public contract, schema หรือ business rule เปลี่ยน

### 2.2 Conventions

- Controller รับผิดชอบ routing/guard/HTTP concerns; business logic อยู่ใน service
- Input ภายนอกต้องผ่าน DTO และ global `CustomValidationPipe`
- Validation เปิด `whitelist`, `forbidNonWhitelisted`, `transform` และ implicit conversion
- ชื่อ property ฝั่ง TypeScript ใช้ camelCase; column PostgreSQL ใช้ snake_case
- ใช้ `@CurrentUser('id')` สำหรับ `createdBy`/`updatedBy`
- Master data ส่วนใหญ่ใช้ soft delete ผ่าน `isActive`; transaction draft ใช้ hard deleteได้ตาม service
- Update DTO ของ master data, Material, Product, BOM และ Materials Receiving หลายตัวบังคับส่ง `updatedAt`; ต้องตรวจ service ก่อนอ้างว่าเป็น optimistic concurrency เพราะ Product/BOM ปัจจุบันรับ field แต่ยังไม่ compare token
- ห้าม log access token, refresh token, password หรือ payload ที่เป็นความลับ

### 2.3 Forbidden patterns และ security debt

- ห้ามเพิ่ม secret/password แบบ hardcode
- ห้ามเปิด CORS กว้างใน production; ต้องกำหนด `CORS_ORIGIN`
- ห้ามเปิด `synchronize: true`; schema ต้องเปลี่ยนผ่าน migration
- ห้าม bypass `JwtAuthGuard`, `ActiveAssignmentGuard`, `RolesGuard` หรือ `PermissionGuard`
- ห้ามใช้ JavaScript `number` กับค่า `numeric(18,4)` ที่ต้องรักษาความแม่นยำ
- `src/database/seeds/seed.ts` ยังมี default DB password ใน standalone runner และ `check-schema.js` เป็นไฟล์ local ที่มี credential; ทั้งสองเป็น security debt ห้ามนำรูปแบบนี้ไปใช้ต่อ และ `check-schema.js` ไม่ถูก commit
- Repository ไม่มี `.env.example` ในสถานะปัจจุบัน แม้ README เดิมจะอ้างถึงไฟล์นี้

## 3. Bootstrap และ HTTP behavior

`src/main.ts` ทำงานตามลำดับนี้:

1. สร้าง `NestExpressApplication`
2. ตั้ง global prefix เป็น `/api/v1`
3. mount static Material images ที่ `/uploads/materials/` และ Product images ที่ `/uploads/products/`; staged images อยู่ใต้ `.tmp/` ของแต่ละ resource
4. เปิด global validation pipe
5. เปิด logging interceptor
6. เปิด CORS พร้อม credentials
7. สร้าง Swagger document ที่ `/api/docs`
8. listen ตาม `PORT` (default `3001`)

### 3.1 Response conventions

- ไม่มี global response-envelope interceptor; service return อะไร client ได้ shape นั้นโดยตรง
- List endpoint ส่วนใหญ่คืน `{ items, meta }`
- Master data และ inventory list ใช้ meta แบบ `{ page, limit, totalItems, totalPages }`
- Products list คืน `{ items, meta: { totalItems } }` และไม่มี page/limit ใน DTO ปัจจุบัน
- Delete transaction endpoint ที่กำหนด `204 No Content` ได้แก่ Materials Receiving และ Materials Disbursement
- QR endpoint คืน binary `image/png` ไม่ใช่ JSON

### 3.2 Validation error

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "code": "VALIDATION_ERROR",
  "message": "field must satisfy validation rule"
}
```

Custom exceptions อาจเพิ่ม `path` และ `timestamp`; NestJS exceptions ทั่วไปอาจใช้ shape มาตรฐานของ Nest จึงไม่ควรสมมติว่า error ทุกประเภทมี field เหมือนกันทั้งหมด

### 3.3 Authentication ไม่ได้เป็น global guard

ไม่มี `APP_GUARD` ใน project ปัจจุบัน การป้องกัน route เกิดจาก `@UseGuards(...)` บน controller/method ดังนั้น endpoint ใหม่ต้องประกาศ guard เอง ห้ามสันนิษฐานว่า route จะถูกป้องกันอัตโนมัติ

## 4. Architecture และ module map

```text
HTTP request
  └─ Controller
      ├─ JwtAuthGuard / RolesGuard หรือ ActiveAssignmentGuard / PermissionGuard
      ├─ DTO + CustomValidationPipe
      └─ Service
          ├─ TypeORM Repository / QueryBuilder
          ├─ DataSource transaction (เมื่อเปลี่ยนหลายตาราง)
          └─ Entity → PostgreSQL schema
```

### 4.1 Module groups

| กลุ่ม             | Modules                                                                                                                                                   |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity/RBAC     | `auth`, `users`, `departments`, `roles`, `menus`, `permissions`, `sessions`, `audit-logs`, `access-control`                                               |
| Material master   | `materials`, `units`, `suppliers`, `material-models`, `delivery-types`, `loading-points`, `categories`, `organizations`, `status-items`, `reject-reasons` |
| Inventory         | `materials-receiving`, `materials-disbursement`, `stock-balances`                                                                                         |
| Production master | `products`, `boms`                                                                                                                                        |

`AccessControlModule` เป็น cross-cutting module สำหรับคำนวณ effective permissions และสร้าง menu tree ไม่มี controller ของตัวเอง

### 4.2 Runtime modules

`AppModule` import 25 feature modulesข้างต้น ไม่ได้ import `goods-receipts` อีกต่อไป โค้ด controller/service/entity/migrations ของ Goods Receipt รุ่นเก่าถูกลบใน commit `b4114ab`

## 5. Data model

### 5.1 IAM schema (12 tables)

| Table                             | หน้าที่                                                                         |
| --------------------------------- | ------------------------------------------------------------------------------- |
| `iam.users`                       | บัญชีผู้ใช้, password hash, lock/active state, permission version               |
| `iam.roles`                       | Role แบบ `SYSTEM` หรือ `DEPARTMENT`                                             |
| `iam.actions`                     | CREATE, READ, UPDATE, DELETE, POST, CANCEL                                      |
| `iam.role_actions`                | Action ที่ role ใช้ได้                                                          |
| `iam.departments`                 | หน่วยงานของ assignment                                                          |
| `iam.user_department_roles`       | Assignment ระหว่าง user, role และ department; SYSTEM role ใช้ department `NULL` |
| `iam.menus`                       | Menu tree (`MAIN`/`SUB`)                                                        |
| `iam.permissions`                 | Permission code ผูก menu + action                                               |
| `iam.department_permissions`      | Permission ที่เปิดให้ department                                                |
| `iam.user_department_permissions` | Permission override ของ assignment                                              |
| `iam.auth_sessions`               | Refresh token hash, expiry และ revoke state                                     |
| `iam.audit_logs`                  | Audit trail                                                                     |

```text
users ──< user_department_roles >── roles ──< role_actions >── actions
                    │
                    ├── departments
                    └── user_department_permissions >── permissions
departments ──< department_permissions >── permissions
menus ──< permissions >── actions
users ──< auth_sessions
```

### 5.2 Master schema (19 tables)

| Domain              | Tables                                                                                                                       |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Material            | `materials`, `units`, `suppliers`, `supplier_materials`, `material_models`, `delivery_types`, `loading_points`, `categories` |
| Organization/status | `organizations`, `status_items`, `reject_reasons`                                                                            |
| Product             | `products`, `product_models`, `customers`, `locations`, `product_types`, `process_lines`                                     |
| BOM                 | `product_boms`, `product_bom_items`                                                                                          |

ความสัมพันธ์หลัก:

```text
materials ── unit
    ├── material_model
    ├── delivery_type
    ├── loading_point
    └──< supplier_materials >── suppliers

products ── unit / product_model / customer / location
    ├── product_type / delivery_type / loading_point / process_line
    └──< product_boms ──< product_bom_items >── materials + units
```

ตาราง `product_models`, `customers`, `locations`, `product_types` และ `process_lines` มี entity/migration/seed และถูกใช้ผ่าน `/products/lookups` แต่ยังไม่มี controller CRUD ของตัวเอง

### 5.3 Inventory schema (9 tables)

| Table                             | หน้าที่                                                           |
| --------------------------------- | ----------------------------------------------------------------- |
| `material_receivings`             | Header รับเข้า; snapshot material type/ratio, lot, QR, PO, status |
| `material_receiving_packages`     | Package ย่อย, lot detail, quantity, QR และ package status         |
| `material_receiving_lot_counters` | Counter ต่อวันที่สำหรับ internal lot                              |
| `stock_balances`                  | ยอดปัจจุบัน unique ต่อ material                                   |
| `stock_transactions`              | Ledger RECEIVE/ISSUE/ADJUST พร้อม before/in/out/after             |
| `materials_disbursements`         | Header จ่ายออกแบบ `stock_cut` หรือ `production`                   |
| `material_disbursement_items`     | จำนวนขอเบิกและจำนวนจ่ายจริง                                       |
| `material_disbursement_packages`  | Allocation จาก receiving package ตาม FIFO                         |
| `materials_disbursement_counters` | Counter เลขเอกสารจ่ายต่อวัน                                       |

## 6. Authentication flow

### 6.1 Login

`POST /api/v1/auth/login` ตรวจ username/password, active/locked state และนับ failed attempts ค่า default lock คือ 5 ครั้งเป็นเวลา 15 นาที

- ผู้ใช้ที่มี assignment เดียว/เลือกได้ทันที: คืน access token, refresh token, user, active assignment และ access control
- ผู้ใช้ที่ต้องเลือก department: คืน `departmentSelectionToken` อายุสั้นและรายการ assignments จากนั้นเรียก `/auth/select-department`
- Refresh token ถูกเก็บเป็น hash ใน `auth_sessions`

### 6.2 Select/switch department

- `select-department` เป็น public เพราะใช้ token เฉพาะกิจที่ sign ด้วย `JWT_DEPARTMENT_SELECTION_SECRET`
- `switch-department` ต้องใช้ access token และเลือก assignment ที่เป็นของ user เท่านั้น
- JWT ใหม่บรรจุ active role/department/assignment ที่ guards และ permission service ใช้ต่อ

### 6.3 Refresh/logout

- `/auth/refresh` และ `/auth/refresh-token` เป็น aliases
- Refresh ตรวจ signature, session, hash, expiry, revoke state และสถานะ user/assignment
- Logout revoke session ปัจจุบัน; SUPER_ADMIN จัดการ session ทั้งระบบผ่าน `/sessions`

## 7. Authorization / RBAC

### 7.1 Guard stacks

| กลุ่ม endpoint  | Guards                                                     | ความหมาย                                     |
| --------------- | ---------------------------------------------------------- | -------------------------------------------- |
| Auth protected  | `JwtAuthGuard`                                             | JWT ถูกต้อง                                  |
| IAM admin       | `JwtAuthGuard`, `RolesGuard` + `SUPER_ADMIN`               | เฉพาะ SUPER_ADMIN                            |
| Business/master | `JwtAuthGuard`, `ActiveAssignmentGuard`, `PermissionGuard` | ต้องมี active assignment และ permission code |

`SUPER_ADMIN` bypass การตรวจ effective permission ใน `PermissionGuard` และ bypass requirement เรื่อง department assignment

### 7.2 Permission resolution

Permission ถูกคำนวณตาม user + active assignment ไม่รวม permission จาก assignment อื่น กลไกประกอบด้วย role/action, department permission และ user-assignment permission จากนั้นคืนชุด code สำหรับ guard/menu

`@RequirePermissions(A, B)` หมายถึงต้องมีครบทุก code ส่วน `@RequireAnyPermissions(A, B)` หมายถึงมีอย่างน้อยหนึ่ง code

### 7.3 Permission families

- Master CRUD: `<RESOURCE>_VIEW|CREATE|UPDATE|DELETE`
- Materials Receiving: เพิ่ม `MATERIALS_RECEIVING_CONFIRM`, `MATERIALS_RECEIVING_CANCEL`
- Materials Disbursement: เพิ่ม `MATERIALS_DISBURSEMENT_CONFIRM`, `MATERIALS_DISBURSEMENT_CANCEL`
- Products: เพิ่ม `PRODUCTS_RESTORE`
- BOM constants มี `BOMS_ACTIVATE`/`BOMS_DEACTIVATE` แต่ controller ปัจจุบันใช้ `BOMS_UPDATE` สำหรับ activate/deactivate

## 8. Business rules

### 8.1 Material master

- `code` unique; reference และ supplier ที่เลือกต้องมีอยู่และ active
- `materialType`: `PCS`, `PIPE`, `SHEET`, `COIL`
- `type`: `PC`, `OF`, `OF_MAT`
- `PCS` ต้องไม่มี `ratio`; PIPE/SHEET/COIL ต้องมี integer `ratio >= 1`
- `supplierIds` ต้องไม่ซ้ำ และ sync ผ่าน `supplier_materials`
- `packingQuantity` เป็น integer `>= 1` เมื่อระบุ
- การอัปโหลดรูปเป็นสองขั้น: `POST /materials/images` stage ไฟล์ แล้วส่ง temporary `imagePath` ใน create/update เพื่อ promote
- รองรับ JPEG/PNG/WebP สูงสุด 5 MiB และตรวจ file signature; staged file เก่ากว่า 24 ชั่วโมงถูก cleanup แบบจำกัดจำนวน

### 8.2 Materials Receiving

- Status: `draft → confirmed → cancelled`; draft เท่านั้นที่ update/delete ได้
- `receiveQuantity` ต้องมากกว่า 0 และใช้ decimal ไม่เกิน 4 ตำแหน่ง
- `receiveDate` ห้ามเป็นอนาคต
- Supplier ระบุเองได้; หากไม่ส่ง service auto-resolve เมื่อ material มี active supplier เดียว หากมีหลายรายต้องส่ง `supplierId`
- Material, supplier และ mapping ต้อง active
- `packingQuantity` อ่าน snapshot จาก material หรือ `packingQuantityOverride`; ต้อง `>= 1`
- PIPE/SHEET/COIL คำนวณ `piecesQuantity = receiveQuantity × ratio`; PCS ไม่มี pieces quantity/QR ชุดที่สอง
- สร้าง internal lot/run no และ package/QR ใน transaction
- Confirm เพิ่ม stock balance, สร้าง RECEIVE transaction และเปลี่ยน package เป็น `in_stock`
- Cancel confirmed document ลดยอดกลับและสร้าง ADJUST transaction ใน transaction; cancel draft ไม่เคยเพิ่ม stock ปัจจุบัน receiving cancel ยังไม่เปลี่ยน package status และไม่ตรวจ downstream FIFO allocation
- Update ใช้ `updatedAt` ป้องกัน lost update

### 8.3 Materials Disbursement

- Type: `stock_cut` หรือ `production`; `stock_cut` ต้องมี `reason`
- Status: `draft → confirmed → cancelled`; draft เท่านั้นที่ update/delete/confirm ได้
- ต้องมีอย่างน้อยหนึ่ง item และทุก `requestedQuantity > 0`
- `disbursementDate` ห้ามเป็นอนาคต
- Confirm lock/allocate stock แบบ FIFO จาก receiving packages เก่าสุดก่อน, สร้าง package allocations, ISSUE transactions และลด stock balance
- หาก stock ไม่พอ confirm ล้มเหลวทั้ง transaction
- Cancel confirmed document คืน quantity ให้ packages/stock และย้อน allocation ใน transaction
- Report แสดง source lot ที่ถูก FIFO allocation

### 8.4 Products

- `code` unique
- FK บังคับ 8 รายการ: unit, product model, customer, location, product type, delivery type, loading point, process line
- `packing`/`lotSize` default 1 และต้อง `>= 1`
- ค่า auto: `safetyStock = lotSize`, `minStock = packing` เว้นแต่ส่ง override
- เมื่อ update packing/lotSize ระบบพยายามรักษาค่า override เดิม; ค่า auto เดิมจะถูก recompute
- Delete เป็น soft delete; restore ใช้ permission `PRODUCTS_RESTORE`
- List ปัจจุบันไม่รองรับ pagination แม้ master list อื่นรองรับ
- Update DTO บังคับ `updatedAt` แต่ service ปัจจุบันยังไม่ตรวจ optimistic concurrency token
- การอัปโหลดรูปเป็นสองขั้นเหมือน Material: `POST /products/images` stage ไฟล์ แล้วส่ง temporary `productImagePath` ใน create/update เพื่อ promote หลัง validation
- รองรับ JPEG/PNG/WebP สูงสุด 5 MiB, ตรวจ file signature, ใช้ชื่อ UUID ฝั่ง server และ cleanup staged file เก่ากว่า 24 ชั่วโมง
- เมื่อ transaction ล้มเหลว ระบบลบ promoted image ชดเชย; เมื่อแทนที่หรือตั้ง `productImagePath: null` ระบบลบรูปเก่าหลัง transaction commit

### 8.5 BOM

- Status: `DRAFT`, `ACTIVE`, `INACTIVE`
- Create ต้องมี item 1–200 รายการ; material/unit ทุก id ต้องมีอยู่
- Version สร้างอัตโนมัติ `v1`, `v2`, ... ต่อ product
- ACTIVE BOM ห้าม update, add/remove item หรือ hard delete
- Activate BOM หนึ่งรายการจะเปลี่ยน ACTIVE BOM อื่นของ product เดียวกันเป็น INACTIVE
- `quantity >= 0.0001`; `wastagePercent` อยู่ระหว่าง 0–100
- Controller รับ `updatedAt` ใน update DTO แต่ service ปัจจุบันยังไม่ได้ตรวจ optimistic concurrency ของ BOM
- Constants `BOMS_ACTIVATE`/`BOMS_DEACTIVATE` ยังไม่ได้ถูกใช้โดย controller/seed registry

## 9. Module catalog

| Module                 | Base path                 | Protection     | หมายเหตุ                                  |
| ---------------------- | ------------------------- | -------------- | ----------------------------------------- |
| app                    | `/api/v1`                 | Public         | health/root string                        |
| auth                   | `/auth`                   | mixed          | login/select/refresh public; ที่เหลือ JWT |
| users                  | `/users`                  | SUPER_ADMIN    | user + assignment aggregate               |
| departments            | `/departments`            | SUPER_ADMIN    | hard delete ตาม service                   |
| roles                  | `/roles`                  | SUPER_ADMIN    | role/action management                    |
| menus                  | `/menus`                  | SUPER_ADMIN    | list/tree/CRUD                            |
| permissions            | `/permissions`            | SUPER_ADMIN    | CRUD + department mapping                 |
| sessions               | `/sessions`               | SUPER_ADMIN    | inspect/revoke                            |
| audit-logs             | `/audit-logs`             | SUPER_ADMIN    | read-only                                 |
| materials              | `/materials`              | permission     | CRUD/lookups/image staging                |
| units                  | `/units`                  | permission     | soft delete/restore                       |
| suppliers              | `/suppliers`              | permission     | soft delete/restore                       |
| material-models        | `/material-models`        | permission     | soft delete/restore                       |
| delivery-types         | `/delivery-types`         | permission     | soft delete/restore                       |
| loading-points         | `/loading-points`         | permission     | soft delete/restore                       |
| categories             | `/categories`             | permission     | hierarchy + soft delete                   |
| organizations          | `/organizations`          | permission     | hierarchy/type + soft delete              |
| status-items           | `/status-items`           | permission     | status by module                          |
| reject-reasons         | `/reject-reasons`         | permission     | soft delete/restore                       |
| materials-receiving    | `/materials-receiving`    | permission     | lot/package/QR/stock/report               |
| materials-disbursement | `/materials-disbursement` | permission     | FIFO issue/report                         |
| stock-balances         | `/stock-balances`         | receiving VIEW | current stock                             |
| products               | `/products`               | permission     | Product + 8 lookups + image staging       |
| boms                   | `/boms`                   | permission     | version/status/items                      |

## 10. Database migrations and seeds

### 10.1 Commands

```bash
pnpm run migration:run
pnpm run migration:revert
pnpm run migration:generate -- src/database/migrations/<Name>
pnpm run seed:run
pnpm run db:reset
```

`db:reset` เป็น destructive และใช้เฉพาะ development

### 10.2 Migration timeline

| Range                  | เนื้อหา                                                                             |
| ---------------------- | ----------------------------------------------------------------------------------- |
| `1700000000000`–`0004` | IAM schema/tables, permission effect, department permissions, assignment uniqueness |
| `1700000000005`–`0007` | Material master, case-insensitive material code, additional master tables           |
| `1700000000009`        | POST/CANCEL actions                                                                 |
| `1786197666075`        | Material type                                                                       |
| `1786197666076`–`6079` | Materials Receiving, package/run/lot detail และ constraint fix                      |
| `1786700000000`–`0002` | Material shape/ratio, PO/snapshot, pieces QR                                        |
| `1786700000003`        | Materials Disbursement/FIFO tables                                                  |
| `1786700000004`        | Products/BOM schema รุ่นแรก                                                         |
| `1786700000005`        | Rebuild Products และเพิ่ม product master tables                                     |

Migration filename order เป็น source of truth; spec filesในโฟลเดอร์เดียวกันไม่ใช่ migration runtime

### 10.3 Seed behavior

`seed.ts` สร้าง action, default organization, roles, role-actions, departments, menus, permissions และ initial SUPER_ADMIN แบบ idempotent เป็นส่วนใหญ่

`seed-master-data.ts` seed product models, customers, locations, product types, process lines, products และ BOM ตัวอย่าง ข้อมูลนี้เป็น sample/bootstrap data ไม่ใช่ API contract

## 11. Environment variables

| Variable                              | Required/default                   | ใช้ทำอะไร                                         |
| ------------------------------------- | ---------------------------------- | ------------------------------------------------- |
| `NODE_ENV`                            | `development`                      | runtime mode                                      |
| `PORT`                                | `3001`                             | HTTP port                                         |
| `CORS_ORIGIN`                         | empty                              | comma-separated origins; empty currentlyเปิดกว้าง |
| `DB_HOST`                             | `localhost`                        | PostgreSQL host                                   |
| `DB_PORT`                             | `5432`                             | PostgreSQL port                                   |
| `DB_USERNAME`                         | `postgres`                         | DB user                                           |
| `DB_PASSWORD`                         | required in config                 | DB password                                       |
| `DB_DATABASE`                         | `cps_database`                     | database name                                     |
| `DB_SCHEMA`                           | `iam`                              | default schema                                    |
| `DB_LOGGING`                          | `false`                            | TypeORM logging                                   |
| `JWT_ACCESS_SECRET`                   | required                           | access-token signing                              |
| `JWT_ACCESS_EXPIRES_IN`               | `8h`                               | access-token TTL                                  |
| `JWT_REFRESH_SECRET`                  | required                           | refresh-token signing                             |
| `JWT_REFRESH_EXPIRES_IN`              | `7d`                               | refresh-token TTL                                 |
| `JWT_DEPARTMENT_SELECTION_SECRET`     | required                           | selection-token signing                           |
| `JWT_DEPARTMENT_SELECTION_EXPIRES_IN` | configured/default in auth service | selection-token TTL                               |
| `MAX_FAILED_LOGIN_ATTEMPTS`           | `5`                                | lock threshold                                    |
| `ACCOUNT_LOCK_MINUTES`                | `15`                               | lock duration                                     |
| `DEFAULT_ORGANIZATION_CODE`           | `CPS`                              | organization used by receiving                    |
| `MATERIAL_IMAGE_ROOT`                 | `<cwd>/uploads/materials`          | filesystem root for Material images               |
| `PRODUCT_IMAGE_ROOT`                  | `<cwd>/uploads/products`           | filesystem root for Product images                |
| `INITIAL_SUPER_ADMIN_*`               | seed defaults                      | username/password/name/email สำหรับ bootstrap     |

## 12. Development and verification

```bash
pnpm install
pnpm run start:dev
pnpm test -- --runInBand
pnpm run build
pnpm run lint
```

ข้อควรระวัง: `pnpm run lint` ใช้ `--fix` จึงแก้ไฟล์ได้ ไม่ใช่ read-only check

### 12.1 Checklist เมื่อเพิ่ม endpoint

- route และ HTTP method ไม่ชน static/dynamic path
- guard/role/permission ถูกต้อง
- DTO ปฏิเสธ unknown fields และ validate ทุก external input
- response/list pagination สอดคล้อง module ใกล้เคียง
- entity column/schema/FK ตรง migration
- multi-table write อยู่ใน transaction
- test ครอบคลุม happy path, validation, permission และ conflict/not-found
- อัปเดต `API_ENDPOINTS.md`, Wiki และ permission registry/seed เมื่อจำเป็น

## 13. Known gaps ณ วันที่อัปเดต

- ไม่มี CRUD endpoints แยกสำหรับ `product_models`, `customers`, `locations`, `product_types`, `process_lines`
- Swagger tags/DTO annotations ยังไม่ครอบคลุมทุก module จึงไม่ควรใช้ Swagger เป็นแหล่ง contract เดียว
- Products list ไม่มี page/limit และ meta pagination ต่างจาก master modules อื่น
- Product update รับ `updatedAt` แต่ service ยังไม่ตรวจ token
- BOM update รับ `updatedAt` แต่ service ยังไม่ตรวจ token
- BOM activate/deactivate ใช้ `BOMS_UPDATE` แม้มี permission constants เฉพาะ
- `UnifiedReportQueryDto.materialId` ใช้ `@IsDateString()` ซึ่งไม่สอดคล้องกับความหมายของ id
- `AddBomItemDto` มี validation เบากว่า item ใน Create BOM
- การ cancel Materials Receiving ที่ confirmed ยังไม่เปลี่ยน package status และไม่ป้องกันการลดยอดติดลบเมื่อ stock จาก lot นั้นถูกใช้ไปแล้ว
- ไม่มี `.env.example`
- CORS เปิดทุก origin เมื่อ `CORS_ORIGIN` ว่าง
- standalone seed runner ยังมี default DB password ใน source; ต้องแก้ก่อนนำ workflow นี้ไปใช้ production
