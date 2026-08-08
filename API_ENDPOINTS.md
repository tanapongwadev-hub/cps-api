# API Endpoints - Frontend Reference

> Base URL: ตัวแปร `baseUrl` เช่น `http://localhost:3001/api/v1`
> Authorization: ส่ง `Authorization: Bearer <accessToken>` สำหรับ endpoints ที่ต้อง authentication

## Authentication

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/auth/login` | Public | เข้าสู่ระบบ (`username`, `password`) |
| POST | `/auth/select-department` | Public (ต้องใช้ `departmentSelectionToken` จาก `/auth/login` + `userDepartmentRoleId`) | เลือก department/role หลัง login |
| POST | `/auth/switch-department` | Bearer | เปลี่ยน department/role ระหว่างใช้งาน (`userDepartmentRoleId`) |
| POST | `/auth/refresh` หรือ `/auth/refresh-token` | Public | refresh access token ด้วย `refreshToken` (ทั้งสอง path เป็น alias) |
| POST | `/auth/logout` | Bearer | ออกจากระบบ (revoke session ปัจจุบัน) |
| GET | `/auth/me` | Bearer | ข้อมูลผู้ใช้ปัจจุบัน รวม departments, roles และ `accessControl: { menus, permissions }` |
| GET | `/auth/me/menus` | Bearer | ดึงเมนูของผู้ใช้ปัจจุบัน |
| GET | `/auth/me/permissions` | Bearer | ดึงสิทธิ์ของผู้ใช้ปัจจุบัน |

## Users (ต้องเป็น SUPER_ADMIN)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/users` | Bearer + SUPER_ADMIN | รายการผู้ใช้ (รองรับ `page`, `limit`, `search`) |
| GET | `/users/:id` | Bearer + SUPER_ADMIN | ข้อมูลผู้ใช้ตาม id |
| POST | `/users` | Bearer + SUPER_ADMIN | สร้างผู้ใช้ใหม่ |
| PATCH | `/users/:id` | Bearer + SUPER_ADMIN | แก้ไขข้อมูลผู้ใช้ |
| PATCH | `/users/:id/status` | Bearer + SUPER_ADMIN | อัปเดตสถานะผู้ใช้ (active/locked) |
| POST | `/users/:id/reset-password` | Bearer + SUPER_ADMIN | รีเซ็ตรหัสผ่าน |
| GET | `/users/:id/access-summary` | Bearer + SUPER_ADMIN | Effective menu access grouped by assignment |
| GET | `/users/:id/assignments` | Bearer + SUPER_ADMIN | ดึง assignments ของผู้ใช้ |
| POST | `/users/:id/assignments` | Bearer + SUPER_ADMIN | สร้าง assignment ใหม่ |
| PATCH | `/users/:id/assignments/:assignmentId` | Bearer + SUPER_ADMIN | แก้ไข assignment รายรายการ |
| DELETE | `/users/:id/assignments/:assignmentId` | Bearer + SUPER_ADMIN | ลบ assignment รายรายการ |
| DELETE | `/users/:id` | Bearer + SUPER_ADMIN | ลบผู้ใช้ |

### GET `/users/:id/access-summary`

Returns persisted, effective menu access grouped by assignment. Inactive or expired assignments are returned with empty `permissions`, `menus`, and `menuCount: 0`. System assignments have `department: null`. Menu-tree nodes serialize `menuType` as `MAIN | SUB`, matching the persisted menu discriminator.

```json
{
  "userId": "7",
  "assignments": [
    {
      "assignmentId": "76",
      "department": {
        "id": "3",
        "code": "PROD",
        "name": "ฝ่ายผลิต"
      },
      "role": {
        "id": "4",
        "code": "OPERATOR",
        "name": "พนักงานผลิต",
        "scopeType": "DEPARTMENT"
      },
      "isActive": true,
      "expiredAt": null,
      "permissions": ["production.read"],
      "menus": [
        {
          "id": "menu-production",
          "code": "production",
          "name": "การผลิต",
          "nameEn": "Production",
          "path": "/production",
          "icon": null,
          "menuType": "MAIN",
          "sortOrder": 1,
          "permissions": [],
          "children": []
        }
      ],
      "menuCount": 1
    }
  ]
}
```

### PATCH `/users/:id` — Aggregate Assignment Update

ส่งข้อมูลส่วนตัวพร้อม `assignments` ซึ่งเป็นสถานะปลายทางทั้งหมดของผู้ใช้ใน request เดียว:

```json
{
  "firstName": "Somchai",
  "lastName": "Jaidee",
  "email": "somchai@example.com",
  "telephone": "0812345678",
  "assignments": [
    { "id": "12", "departmentId": "3", "roleId": "5" },
    { "departmentId": null, "roleId": "1" }
  ]
}
```

- Assignment เดิมที่ต้องการคงไว้หรือแก้ไขให้ส่ง `id`; รายการใหม่ไม่ต้องส่ง `id`
- Assignment เดิมที่ไม่อยู่ใน array จะถูกลบ โดยผู้ใช้ต้องเหลืออย่างน้อย 1 รายการ
- ห้ามมีคู่ `(departmentId, roleId)` ซ้ำกัน
- System role ใช้ `departmentId: null`; department role ต้องระบุ `departmentId`
- Backend ตรวจสอบและเพิ่ม/แก้ไข/ลบ Assignment พร้อมข้อมูลส่วนตัวภายใน transaction เดียว
- เมื่อชุด Assignment เปลี่ยน `permissionVersion` จะเพิ่มขึ้น ทำให้ access token เดิมใช้ไม่ได้และต้อง login ใหม่

## Departments (ต้องเป็น SUPER_ADMIN)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/departments` | Bearer + SUPER_ADMIN | รายการแผนก (รองรับ `page`, `limit`, `search`) |
| GET | `/departments/:id` | Bearer + SUPER_ADMIN | ข้อมูลแผนก |
| POST | `/departments` | Bearer + SUPER_ADMIN | สร้างแผนก |
| PATCH | `/departments/:id` | Bearer + SUPER_ADMIN | แก้ไขแผนก |
| DELETE | `/departments/:id` | Bearer + SUPER_ADMIN | ลบแผนก |

## Roles (ต้องเป็น SUPER_ADMIN)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/roles` | Bearer + SUPER_ADMIN | รายการบทบาท (รองรับ `page`, `limit`, `search`, `status`) |
| GET | `/roles/:id` | Bearer + SUPER_ADMIN | ข้อมูลบทบาท |
| POST | `/roles` | Bearer + SUPER_ADMIN | สร้างบทบาท |
| PATCH | `/roles/:id` | Bearer + SUPER_ADMIN | แก้ไขบทบาท |
| DELETE | `/roles/:id` | Bearer + SUPER_ADMIN | ลบบทบาท |

### Query Parameters ของ `GET /roles`

| Param | Type | Default | หมายเหตุ |
|---|---|---|---|
| `page` | int ≥ 1 | `1` | หน้าที่ต้องการ |
| `limit` | int 1–100 | `20` | จำนวนต่อหน้า |
| `search` | string | — | ค้นหา `code`, `nameTh`, `nameEn` (ILIKE) |
| `status` | `active` \| `inactive` | — | กรองตามสถานะ (`active` = isActive true, `inactive` = isActive false) |

Response ของ list รวม `actionCodes`, `permissionCount` และ `userCount` ในแต่ละ role:

```json
{
  "items": [
    {
      "id": "1",
      "code": "SUPER_ADMIN",
      "nameTh": "ผู้ดูแลระบบ",
      "nameEn": "Super Admin",
      "scopeType": "SYSTEM",
      "isActive": true,
      "isSystem": true,
      "description": null,
      "createdAt": "2026-08-01T00:00:00.000Z",
      "updatedAt": "2026-08-01T00:00:00.000Z",
      "actionCodes": ["VIEW", "CREATE", "UPDATE", "DELETE"],
      "permissionCount": 4,
      "userCount": 2
    }
  ],
  "meta": { "page": 1, "limit": 20, "totalItems": 1, "totalPages": 1 }
}
```

## Menus (ต้องเป็น SUPER_ADMIN)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/menus` | Bearer + SUPER_ADMIN | รายการเมนู (รองรับ `page`, `limit`, `search`) |
| GET | `/menus/tree` | Bearer + SUPER_ADMIN | โครงสร้างเมนูแบบ tree |
| GET | `/menus/:id` | Bearer + SUPER_ADMIN | ข้อมูลเมนู |
| POST | `/menus` | Bearer + SUPER_ADMIN | สร้างเมนู |
| PATCH | `/menus/:id` | Bearer + SUPER_ADMIN | แก้ไขเมนู |
| DELETE | `/menus/:id` | Bearer + SUPER_ADMIN | ลบเมนู |

## Permissions (ต้องเป็น SUPER_ADMIN)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/permissions` | Bearer + SUPER_ADMIN | รายการ permission (รองรับ `page`, `limit`, `search`) พร้อม `departments` |
| GET | `/permissions/options` | Bearer + SUPER_ADMIN | ดึง menus + actions สำหรับ dropdown ในฟอร์มสร้าง/แก้ไข permission |
| GET | `/permissions/:id` | Bearer + SUPER_ADMIN | ข้อมูล permission พร้อม `departments` |
| POST | `/permissions` | Bearer + SUPER_ADMIN | สร้าง permission ใหม่ |
| PATCH | `/permissions/:id` | Bearer + SUPER_ADMIN | แก้ไข permission |
| DELETE | `/permissions/:id` | Bearer + SUPER_ADMIN | ลบ permission |
| PUT | `/permissions/:id/departments` | Bearer + SUPER_ADMIN | กำหนดแผนกที่ใช้ permission ได้ |

### GET `/permissions/options`

คืน menus และ actions ที่ active สำหรับใช้ใน dropdown:

```json
{
  "menus": [
    { "id": "1", "code": "dashboard", "nameTh": "แดชบอร์ด", "nameEn": "Dashboard" }
  ],
  "actions": [
    { "id": "1", "code": "VIEW", "nameTh": "ดู", "nameEn": "View" }
  ]
}
```

### POST `/permissions`

```json
{
  "menuId": "1",
  "actionId": "1",
  "code": "DASHBOARD_VIEW",
  "description": "ดูหน้า Dashboard",
  "isActive": true
}
```

| Field | Type | Required | Note |
|---|---|---|---|
| `menuId` | string | ✅ | ID ของ menu (ต้องมีอยู่จริง) |
| `actionId` | string | ✅ | ID ของ action (ต้องมีอยู่จริง) |
| `code` | string | ✅ | รหัส permission (ต้องไม่ซ้ำ) |
| `description` | string \| undefined | — | คำอธิบาย |
| `isActive` | bool | — | default `true` |

### PATCH `/permissions/:id`

ทุก field เป็น optional:

```json
{
  "code": "DASHBOARD_VIEW_UPDATED",
  "description": "ดูหน้า Dashboard (แก้ไข)"
}
```

### DELETE `/permissions/:id`

ลบ permission — ไม่ต้องส่ง body คืน `404` ถ้าไม่พบ

### PUT `/permissions/:id/departments`

`departments: []` ใน permission response หมายถึงใช้งานได้ทุกแผนก ส่วนรายการที่มีค่าจะประกอบด้วย `id`, `code`, `nameTh` และ `nameEn`

Request สำหรับกำหนดแผนก:

```json
{
  "departmentIds": ["1", "2", "3"]
}
```

`departmentIds` ต้องเป็น string array ที่ไม่มีค่าซ้ำและทุก ID ต้องมีอยู่จริง ส่ง array ว่างเพื่อกลับไปใช้งานได้ทุกแผนก ระบบคืน `404` เมื่อไม่พบ permission และ `400` พร้อม `departmentIds` ที่ผิดเมื่อไม่พบแผนก

## Sessions (ต้องเป็น SUPER_ADMIN)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/sessions` | Bearer + SUPER_ADMIN | รายการเซสชัน (รองรับ `page`, `limit`, `userId`) |
| GET | `/sessions/:id` | Bearer + SUPER_ADMIN | ข้อมูลเซสชัน |
| PATCH | `/sessions/:id/revoke` | Bearer + SUPER_ADMIN | revoke เซสชัน |
| POST | `/sessions/revoke-all/:userId` | Bearer + SUPER_ADMIN | revoke ทุกเซสชันของ user |

## Audit Logs (ต้องเป็น SUPER_ADMIN)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/audit-logs` | Bearer + SUPER_ADMIN | รายการ audit logs (รองรับ `page`, `limit`, `userId`, `action`) |
| GET | `/audit-logs/:id` | Bearer + SUPER_ADMIN | ข้อมูล audit log |

## Materials

> Material Master ตาม [Material Master Requirements](docs/wiki/material-master.md)
> สิทธิ์ที่ใช้: `MATERIAL_VIEW`, `MATERIAL_CREATE`, `MATERIAL_UPDATE`, `MATERIAL_DELETE`

| Method | Endpoint | Permission | Description |
|---|---|---|---|
| GET | `/materials` | `MATERIAL_VIEW` | รายการ Material (รองรับ `page`, `limit`, `search`, `isActive`, `unitId`, `modelId`, `deliveryTypeId`, `loadingPointId`, `supplierId`, `sortBy`, `sortOrder`) |
| GET | `/materials/lookups` | `MATERIAL_VIEW` | ดึง Lookup Master Data ทั้งหมด (units, suppliers, models, deliveryTypes, loadingPoints) สำหรับสร้างฟอร์ม |
| GET | `/materials/:id` | `MATERIAL_VIEW` | ข้อมูล Material ตาม id พร้อม suppliers และ lookup relations |
| POST | `/materials` | `MATERIAL_CREATE` | สร้าง Material ใหม่ |
| PATCH | `/materials/:id` | `MATERIAL_UPDATE` | แก้ไข Material (ต้องส่ง `updatedAt` เพื่อทำ optimistic concurrency check) |
| DELETE | `/materials/:id` | `MATERIAL_DELETE` | Soft delete (`isActive = false`) |
| PATCH | `/materials/:id/restore` | `MATERIAL_UPDATE` | Restore Material ที่ถูก soft delete |
| POST | `/materials/images` | `MATERIAL_CREATE` หรือ `MATERIAL_UPDATE` | อัปโหลดรูปภาพ (multipart `file`, JPEG/PNG/WEBP ≤ 5 MiB) ได้ `imagePath` ชั่วคราวไปใช้ใน create/update |

### Query Parameters ของ `GET /materials`

| Param | Type | Default | หมายเหตุ |
|---|---|---|---|
| `page` | int ≥ 1 | `1` | หน้าที่ต้องการ |
| `limit` | int 1–100 | `20` | จำนวนต่อหน้า |
| `search` | string | — | ค้นหา `code` หรือ `name` (ILIKE) |
| `isActive` | bool | — | กรองตามสถานะ |
| `unitId` | string (positive int) | — | กรองตาม Unit |
| `modelId` | string (positive int) | — | กรองตาม Material Model |
| `deliveryTypeId` | string (positive int) | — | กรองตาม Delivery Type |
| `loadingPointId` | string (positive int) | — | กรองตาม Loading Point |
| `supplierId` | string (positive int) | — | กรองตาม Supplier (ดูจาก `supplier_materials`) |
| `sortBy` | enum | `code` | `code` \| `name` \| `isActive` \| `createdAt` \| `updatedAt` |
| `sortOrder` | enum | `asc` | `asc` \| `desc` |

Response:

```json
{
  "items": [
    {
      "id": "42",
      "code": "MAT-001",
      "name": "น้ำมันปาล์ม",
      "unitId": "1",
      "deliveryTypeId": "1",
      "modelId": null,
      "loadingPointId": "1",
      "processLineName": "Line A",
      "scale": "กว้าง 50 × ยาว 100 × สูง 20 ซม.",
      "imagePath": "/uploads/materials/abc.jpg",
      "specification": "...",
      "description": "...",
      "isActive": true,
      "createdBy": "1",
      "updatedBy": "1",
      "createdAt": "2026-08-02T10:00:00.000Z",
      "updatedAt": "2026-08-02T10:00:00.000Z",
      "unit": { "id": "1", "code": "KG", "nameTh": "กิโลกรัม", "nameEn": "Kilogram" },
      "deliveryType": { "id": "1", "code": "TRUCK", "nameTh": "รถบรรทุก" },
      "model": null,
      "loadingPoint": { "id": "1", "code": "RCV-A", "nameTh": "Receiving A" },
      "suppliers": [
        { "id": "1", "code": "SUP-001", "nameTh": "บริษัท ตัวอย่าง จำกัด" }
      ]
    }
  ],
  "meta": { "page": 1, "limit": 20, "totalItems": 1, "totalPages": 1 }
}
```

### `POST /materials`

```json
{
  "code": "MAT-001",
  "name": "น้ำมันปาล์ม",
  "unitId": "1",
  "deliveryTypeId": "1",
  "modelId": null,
  "loadingPointId": "1",
  "processLineName": "Line A",
  "scale": "กว้าง 50 × ยาว 100 × สูง 20 ซม.",
  "imagePath": "/uploads/materials/.tmp/<uuid>.jpg",
  "specification": "...",
  "description": "...",
  "isActive": true,
  "supplierIds": ["1", "2"]
}
```

- `code` จะถูก trim + uppercase อัตโนมัติ
- `imagePath` ต้องเป็น path ที่ได้จาก `POST /materials/images` (ถ้าไม่ส่ง = ไม่มีรูป)
- `supplierIds` ต้องไม่ซ้ำ และทุก id ต้อง active

### `PATCH /materials/:id`

เหมือน `POST /materials` แต่ทุก field เป็น optional และต้องส่ง:

```json
{
  "name": "น้ำมันปาล์ม (ใหม่)",
  "updatedAt": "2026-08-02T10:00:00.000Z"
}
```

- `updatedAt` ต้องตรงกับค่าปัจจุบัน → ถ้าไม่ตรง backend ตอบ `409 Conflict`
- ถ้าเปลี่ยน `supplierIds` ระบบจะ sync (เพิ่มใหม่ / soft delete ของเดิมที่หายไป / restore ของเดิม)
- ถ้าเปลี่ยน `imagePath` ระบบจะ promote ไฟล์ใหม่และลบไฟล์เก่า (ถ้าสำเร็จ)

### `POST /materials/images`

ใช้ `multipart/form-data` field ชื่อ `file`:

```bash
curl -X POST -H "Authorization: Bearer <token>" \
  -F "file=@/path/to/image.jpg" \
  http://localhost:3001/api/v1/materials/images
```

Response:

```json
{
  "imagePath": "/uploads/materials/.tmp/0c9b8e6e-...jpg",
  "previewUrl": "/uploads/materials/.tmp/0c9b8e6e-...jpg"
}
```

> `imagePath` ที่ได้เป็น path ชั่วคราว (อยู่ใน `.tmp/`) ระบบจะย้ายไปยัง root เมื่อ create/update Material สำเร็จ และลบอัตโนมัติภายใน 24 ชั่วโมงหากไม่ถูกใช้

### Lookup response ของ `GET /materials/lookups`

```json
{
  "units": [{ "id": "1", "code": "KG", "nameTh": "กิโลกรัม", "nameEn": "Kilogram" }],
  "suppliers": [{ "id": "1", "code": "SUP-001", "nameTh": "..." }],
  "models": [],
  "deliveryTypes": [{ "id": "1", "code": "TRUCK", "nameTh": "รถบรรทุก" }],
  "loadingPoints": [{ "id": "1", "code": "RCV-A", "nameTh": "Receiving A" }]
}
```

> ทุก lookup จะคืนเฉพาะ `isActive = true` เรียงตาม `code ASC`

## Master Data (CRUD pattern เดียวกันทั้ง 8 resource)

Guard: `JwtAuthGuard` + `ActiveAssignmentGuard` + `PermissionGuard` — ต้องส่ง Bearer token, ต้องมี active assignment และต้องมี permission ตามตาราง

| Resource | Base path | Permission prefix |
|---|---|---|
| Units | `/units` | `UNIT_*` |
| Suppliers | `/suppliers` | `SUPPLIER_*` |
| Categories | `/categories` | `CATEGORY_*` |
| Delivery Types | `/delivery-types` | `DELIVERY_TYPE_*` |
| Loading Points | `/loading-points` | `LOADING_POINT_*` |
| Material Models | `/material-models` | `MATERIAL_MODEL_*` |
| Organizations | `/organizations` | `ORGANIZATION_*` |
| Status Items | `/status-items` | `STATUS_ITEM_*` |

ทุก resource มี 6 endpoints เหมือนกัน (แทน `<base>` ด้วย base path และ `<PREFIX>` ด้วย permission prefix):

| Method | Endpoint | Permission | Description |
|---|---|---|---|
| GET | `<base>` | `<PREFIX>_VIEW` | รายการแบบ pagination |
| GET | `<base>/:id` | `<PREFIX>_VIEW` | ข้อมูลรายการเดียว (404 ถ้าไม่พบ) |
| POST | `<base>` | `<PREFIX>_CREATE` | สร้างใหม่ (409 ถ้า `code` ซ้ำ — เทียบแบบ case-insensitive) |
| PATCH | `<base>/:id` | `<PREFIX>_UPDATE` | แก้ไข ทุก field optional แต่ **ต้องส่ง `updatedAt`** (409 ถ้าไม่ตรง) |
| DELETE | `<base>/:id` | `<PREFIX>_DELETE` | Soft delete (`isActive = false`) |
| PATCH | `<base>/:id/restore` | `<PREFIX>_UPDATE` | Restore (`isActive = true`) |

หมายเหตุร่วม:

- `code` จะถูก trim + uppercase อัตโนมัติทั้งตอน create และ update
- ทุก string field ถูก trim; string ว่างจะถูกแปลงเป็น `null`
- ทุก response object มี field ร่วม: `id`, `isActive`, `createdBy`, `updatedBy`, `createdAt`, `updatedAt`
- DELETE/restore ไม่ต้องส่ง body และไม่ตรวจ `updatedAt`

### Query parameters ของ list endpoint

| Param | Type | Default | ใช้กับ |
|---|---|---|---|
| `page` | int ≥ 1 | `1` | ทุก resource |
| `limit` | int 1–100 | `20` | ทุก resource |
| `search` | string | — | ค้นหา `code`, `nameTh`, `nameEn` (ILIKE) |
| `isActive` | `true` \| `false` | — | ทุก resource |
| `type` | string | — | `/organizations` เท่านั้น |
| `module` | string | — | `/status-items` เท่านั้น |
| `sortBy` | enum | ดูตารางล่าง | ทุก resource |
| `sortOrder` | `asc` \| `desc` | `asc` | ทุก resource |

| Resource | `sortBy` ที่รองรับ | Default |
|---|---|---|
| Units, Suppliers, Delivery Types, Loading Points, Material Models | `code`, `nameTh`, `isActive`, `createdAt`, `updatedAt` | `code` |
| Categories | `code`, `nameTh`, `sortOrder`, `isActive`, `createdAt`, `updatedAt` | `sortOrder` |
| Status Items | `code`, `nameTh`, `module`, `sortOrder`, `isActive`, `createdAt`, `updatedAt` | `sortOrder` |
| Organizations | `code`, `nameTh`, `type`, `isActive`, `createdAt`, `updatedAt` | `code` |

Response ของ list ทุก resource:

```json
{
  "items": [],
  "meta": { "page": 1, "limit": 20, "totalItems": 0, "totalPages": 0 }
}
```

### Fields ของแต่ละ resource

**Units** (`/units`)

| Field | Type | Required (create) | Note |
|---|---|---|---|
| `code` | string ≤ 20 | ✅ | uppercase, unique |
| `nameTh` | string ≤ 100 | ✅ | |
| `nameEn` | string ≤ 100 \| null | — | |
| `symbol` | string ≤ 20 \| null | — | เช่น `kg`, `ตัน` |
| `description` | string \| null | — | |
| `isActive` | bool | — | default `true` |

**Suppliers** (`/suppliers`)

| Field | Type | Required (create) | Note |
|---|---|---|---|
| `code` | string ≤ 50 | ✅ | uppercase, unique |
| `nameTh` | string ≤ 255 | ✅ | |
| `nameEn` | string ≤ 255 \| null | — | |
| `taxId` | string ≤ 20 \| null | — | |
| `contactName` | string ≤ 255 \| null | — | |
| `telephone` | string ≤ 50 \| null | — | |
| `email` | string ≤ 255 \| null | — | ต้องเป็นรูปแบบ email |
| `address` | string \| null | — | |
| `isActive` | bool | — | default `true` |

**Categories** (`/categories`)

| Field | Type | Required (create) | Note |
|---|---|---|---|
| `code` | string ≤ 50 | ✅ | uppercase, unique |
| `nameTh` | string ≤ 100 | ✅ | |
| `nameEn` | string ≤ 100 \| null | — | |
| `parentId` | string \| null | — | ต้องเป็นตัวเลขจำนวนเต็มบวกในรูป string |
| `sortOrder` | int 0–9999 | — | |
| `iconColor` | string ≤ 20 \| null | — | |
| `description` | string \| null | — | |
| `isActive` | bool | — | default `true` |

**Delivery Types** (`/delivery-types`), **Loading Points** (`/loading-points`), **Material Models** (`/material-models`) — ใช้ชุด field เดียวกัน

| Field | Type | Required (create) | Note |
|---|---|---|---|
| `code` | string ≤ 50 | ✅ | uppercase, unique |
| `nameTh` | string ≤ 100 | ✅ | |
| `nameEn` | string ≤ 100 \| null | — | |
| `description` | string \| null | — | |
| `isActive` | bool | — | default `true` |

**Organizations** (`/organizations`)

| Field | Type | Required (create) | Note |
|---|---|---|---|
| `code` | string ≤ 50 | ✅ | uppercase, unique |
| `nameTh` | string ≤ 255 | ✅ | |
| `nameEn` | string ≤ 255 \| null | — | |
| `taxId` | string ≤ 20 \| null | — | |
| `address` | string \| null | — | |
| `phone` | string ≤ 50 \| null | — | |
| `email` | string ≤ 255 \| null | — | ต้องเป็นรูปแบบ email |
| `website` | string ≤ 255 \| null | — | |
| `logoUrl` | string ≤ 500 \| null | — | |
| `parentId` | string \| null | — | ตัวเลขจำนวนเต็มบวกในรูป string |
| `type` | enum | ✅ | `headquarters` \| `branch` \| `subsidiary` \| `department` (default `department`) |
| `isActive` | bool | — | default `true` |

**Status Items** (`/status-items`)

| Field | Type | Required (create) | Note |
|---|---|---|---|
| `code` | string ≤ 50 | ✅ | uppercase, unique |
| `nameTh` | string ≤ 100 | ✅ | |
| `nameEn` | string ≤ 100 \| null | — | |
| `color` | enum ≤ 20 | ✅ | `info` \| `success` \| `warning` \| `danger` \| `muted` (default `info`) |
| `module` | string ≤ 50 | ✅ | ชื่อ module ที่สถานะนี้ใช้ |
| `isDefault` | bool | — | สถานะเริ่มต้นของ module |
| `sortOrder` | int 0–9999 | — | |
| `description` | string \| null | — | |
| `isActive` | bool | — | default `true` |

### ตัวอย่าง create / update

```http
POST /api/v1/units
Authorization: Bearer <accessToken>
Content-Type: application/json

{ "code": "kg", "nameTh": "กิโลกรัม", "nameEn": "Kilogram", "symbol": "kg" }
```

```http
PATCH /api/v1/units/1
Authorization: Bearer <accessToken>
Content-Type: application/json

{ "nameTh": "กิโลกรัม (แก้ไข)", "updatedAt": "2026-08-05T03:21:44.512Z" }
```

## Root

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/` | Public | Hello message จาก `AppController` (default NestJS) |

> เอกสาร Swagger อยู่ที่ `http://localhost:<port>/api/docs` (นอก global prefix)
> ไฟล์ที่อัปโหลดเสิร์ฟผ่าน static path `/uploads/...` (นอก global prefix เช่นกัน)

## คำอธิบาย Auth

- **Public** — ไม่ต้องส่ง token
- **Bearer** — ต้องส่ง `Authorization: Bearer <accessToken>`
- **Bearer + SUPER_ADMIN** — ต้องส่ง token และผู้ใช้ต้องมี role `SUPER_ADMIN`

## Query Parameters ทั่วไป

สำหรับ endpoints รายการที่รองรับ pagination:
- `page` — หน้าที่ต้องการ (default: 1)
- `limit` — จำนวนต่อหน้า (default: 20)
