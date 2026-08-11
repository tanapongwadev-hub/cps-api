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
| GET | `/materials` | `MATERIAL_VIEW` | รายการ Material (รองรับ `page`, `limit`, `search`, `isActive`, `type`, `unitId`, `modelId`, `deliveryTypeId`, `loadingPointId`, `supplierId`, `sortBy`, `sortOrder`) |
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
| `type` | enum | — | กรองตามประเภท: `PC` \| `OF` \| `OF_MAT` |
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
      "type": "PC",
      "unitId": "1",
      "deliveryTypeId": "1",
      "modelId": null,
      "loadingPointId": "1",
      "processLineName": "Line A",
      "scale": "กว้าง 50 × ยาว 100 × สูง 20 ซม.",
      "imagePath": "/uploads/materials/abc.jpg",
      "specification": "...",
      "description": "...",
      "packingQuantity": 25,
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
  "type": "PC",
  "unitId": "1",
  "deliveryTypeId": "1",
  "modelId": null,
  "loadingPointId": "1",
  "processLineName": "Line A",
  "scale": "กว้าง 50 × ยาว 100 × สูง 20 ซม.",
  "imagePath": "/uploads/materials/.tmp/<uuid>.jpg",
  "specification": "...",
  "description": "...",
  "packingQuantity": 25,
  "isActive": true,
  "supplierIds": ["1", "2"]
}
```

- `code` จะถูก trim + uppercase อัตโนมัติ
- `type` เป็น optional ค่าที่รองรับ: `PC` \| `OF` \| `OF_MAT` (ประเภทวัตถุดิบ)
- `imagePath` ต้องเป็น path ที่ได้จาก `POST /materials/images` (ถ้าไม่ส่ง = ไม่มีรูป)
- `supplierIds` ต้องไม่ซ้ำ และทุก id ต้อง active
- `packingQuantity` เป็น optional จำนวนเต็ม ≥ 1 (จำนวนต่อแพ็ก/หน่วยบรรจุ) ส่ง `null` เพื่อล้างค่า

### `PATCH /materials/:id`

เหมือน `POST /materials` แต่ทุก field เป็น optional และต้องส่ง:

```json
{
  "name": "น้ำมันปาล์ม (ใหม่)",
  "type": "OF",
  "updatedAt": "2026-08-02T10:00:00.000Z"
}
```

- `updatedAt` ต้องตรงกับค่าปัจจุบัน → ถ้าไม่ตรง backend ตอบ `409 Conflict`
- `type` สามารถเปลี่ยนได้: `PC` \| `OF` \| `OF_MAT` หรือ `null` เพื่อล้างค่า
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

## Master Data (CRUD pattern เดียวกันทั้ง 9 resource)

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
| Reject Reasons | `/reject-reasons` | `REJECT_REASON_*` |

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

**Reject Reasons** (`/reject-reasons`) — โครงสร้างเหมือน `/loading-points`, `/delivery-types`, `/material-models` ใช้กับ `rejectReasonId` ใน Goods Receipt items

| Field | Type | Required (create) | Note |
|---|---|---|---|
| `code` | string ≤ 50 | ✅ | uppercase, unique |
| `nameTh` | string ≤ 100 | ✅ | |
| `nameEn` | string ≤ 100 \| null | — | |
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

## Goods Receipts

Guard: `JwtAuthGuard` + `ActiveAssignmentGuard` + `PermissionGuard`

Requirement ทั้งหมดอยู่ใน [docs/wiki/goods-receipt.md](docs/wiki/goods-receipt.md)

| Method | Endpoint | Permission | Description |
|---|---|---|---|
| GET | `/goods-receipts` | `GOODS_RECEIPT_VIEW` | รายการ พร้อม filter/sort/pagination |
| GET | `/goods-receipts/lookups` | `GOODS_RECEIPT_VIEW` | Supplier, Material (กรองด้วย `?supplierId=`), Unit, Reject Reason |
| GET | `/goods-receipts/:id` | `GOODS_RECEIPT_VIEW` | หัวเอกสาร + บรรทัด + ไฟล์แนบ |
| POST | `/goods-receipts` | `GOODS_RECEIPT_CREATE` | สร้าง draft |
| PATCH | `/goods-receipts/:id` | `GOODS_RECEIPT_UPDATE` | แก้ draft (ต้องส่ง `updatedAt`) |
| DELETE | `/goods-receipts/:id` | `GOODS_RECEIPT_DELETE` | ลบ draft (hard delete, 204) |
| POST | `/goods-receipts/:id/post` | `GOODS_RECEIPT_POST` | รับรองเอกสาร → ออกเลขที่ |
| POST | `/goods-receipts/:id/cancel` | `GOODS_RECEIPT_CANCEL` | ยกเลิก (ต้องส่ง `cancelReason`) |
| POST | `/goods-receipts/attachments` | `GOODS_RECEIPT_CREATE` หรือ `UPDATE` | Stage ไฟล์ (multipart `file`) |
| POST | `/goods-receipts/:id/attachments` | `GOODS_RECEIPT_CREATE` หรือ `UPDATE` | ผูกไฟล์ที่ stage แล้วเข้าเอกสาร |
| DELETE | `/goods-receipts/:id/attachments/:attachmentId` | `GOODS_RECEIPT_UPDATE` | ลบไฟล์แนบ (เฉพาะ draft, 204) |

### Query Parameters ของ `GET /goods-receipts`

| Parameter | ชนิด | ค่าเริ่มต้น | คำอธิบาย |
|---|---|---|---|
| `page` | number | 1 | |
| `limit` | number | 20 | สูงสุด 100 |
| `search` | string | — | ค้นใน `receiptNo` และ `supplierDocNo` |
| `status` | enum | ไม่กรอง | `draft` / `posted` / `cancelled` — แสดงทุกสถานะรวมที่ยกเลิกถ้าไม่ระบุ |
| `supplierId` | string | — | |
| `materialId` | string | — | มีวัตถุดิบนี้อยู่ในบรรทัดใดบรรทัดหนึ่ง |
| `receiptDateFrom` | `YYYY-MM-DD` | — | |
| `receiptDateTo` | `YYYY-MM-DD` | — | |
| `hasRejection` | boolean | — | `true` = มีบรรทัดที่ปฏิเสธของ |
| `sortBy` | enum | `receiptDate` | `receiptNo` / `receiptDate` / `supplierDocNo` / `createdAt` / `updatedAt` |
| `sortOrder` | enum | `desc` | |

รายการส่งกลับเฉพาะหัวเอกสาร + `supplier` + `itemCount` + `totalQtyReceived` ไม่ส่งบรรทัดทั้งหมด

### `POST /goods-receipts`

```json
{
  "supplierId": "2",
  "receiptDate": "2026-08-08",
  "poNo": "PO-2026-0142",
  "supplierDocNo": "DN-55031",
  "supplierDocDate": "2026-08-07",
  "noSupplierDocument": false,
  "remark": "รถมาถึง 08:30",
  "items": [
    {
      "materialId": "5",
      "qtyDelivered": "1000.0000",
      "qtyReceived": "970.0000",
      "qtyRejected": "30.0000",
      "rejectReasonId": "7",
      "rejectNote": "ถุงขาด 3 ใบ",
      "lotNo": "L2608-01",
      "productionDate": "2026-08-01",
      "expiryDate": "2027-02-01",
      "unitPrice": "112.5000",
      "lineAmount": "109125.0000"
    }
  ],
  "attachments": [
    {
      "docType": "DELIVERY_NOTE",
      "filePath": "/uploads/goods-receipts/.tmp/9f1c....pdf",
      "fileName": "DN-55031.pdf"
    }
  ]
}
```

กฎที่ตรวจ:

- `receiptDate` ห้ามเป็นวันในอนาคต
- `qtyReceived + qtyRejected <= qtyDelivered` และต้องมีอย่างน้อยหนึ่งค่ามากกว่า 0
- `rejectReasonId` จำเป็นเมื่อ `qtyRejected > 0` และต้องว่างเมื่อไม่ปฏิเสธ
- ห้าม `(materialId, lotNo)` ซ้ำในเอกสารเดียว วัตถุดิบซ้ำต่าง lot ได้
- ทุกวัตถุดิบต้องมี mapping ที่ active ใน `master.supplier_materials` กับ Supplier ที่ระบุ มิฉะนั้นตอบ 400
- จำนวนและราคาส่งเป็น string (รับ number ได้แต่จะถูกแปลง) ทศนิยมไม่เกิน 4 ตำแหน่ง

### `POST /goods-receipts/:id/post`

ไม่ต้องส่ง body ระบบจะ:

1. ตรวจว่าเอกสารเป็น `draft` และมีอย่างน้อย 1 บรรทัด
2. ตรวจว่ามี `supplierDocNo` เว้นแต่ `noSupplierDocument = true`
3. Snapshot `materialCode`/`materialName` ลงทุกบรรทัด
4. ออกเลข `GR-YYYYMM-NNNN` จาก `inventory.document_counters`
5. ตั้ง `status = posted`, `postedBy`, `postedAt`

หลัง post แก้ได้เฉพาะ `remark` และการเพิ่มไฟล์แนบ — ตอบ 409 ถ้าพยายามแก้อย่างอื่น

### `POST /goods-receipts/:id/cancel`

```json
{ "cancelReason": "กรอกเลขใบส่งของผิด" }
```

ยกเลิกได้เฉพาะเอกสารที่ `posted` เอกสารยังคงเลขที่เดิมและยังปรากฏในรายการ

### `POST /goods-receipts/attachments`

multipart form-data field ชื่อ `file` — รับ JPEG/PNG/WebP/PDF ไม่เกิน 10 MiB ต่อไฟล์ และ 10 ไฟล์ต่อเอกสาร ตรวจ magic bytes ทุกชนิด

Response คือ metadata ที่ต้องส่งกลับใน `attachments[]` ของ create/update หรือ `POST /goods-receipts/:id/attachments` ไฟล์ใน `.tmp/` จะถูกลบอัตโนมัติหลัง 24 ชั่วโมงถ้าไม่ถูกผูกกับเอกสาร

### Error ที่พบบ่อยของ Goods Receipts

| Code | เมื่อไหร่ |
|---|---|
| `400` | validation ไม่ผ่าน, `qtyReceived + qtyRejected > qtyDelivered`, ขาด `rejectReasonId` ตอน `qtyRejected > 0`, material ไม่มี mapping active กับ supplier ที่ระบุ |
| `404` | ไม่พบเอกสาร หรือไม่พบไฟล์แนบ |
| `409` | `supplierDocNo` ซ้ำกับ supplier เดียวกัน (เอกสารที่ไม่ cancelled), `updatedAt` ไม่ตรง (optimistic lock), หรือ action ไม่ตรงกับสถานะเอกสาร (เช่น post เอกสารที่ posted แล้ว, แก้เอกสารที่ posted, ลบไฟล์แนบของเอกสาร posted) |

## Materials Receiving (รับเข้าวัตถุดิบ + Stock Balance + QR Code)

> ต่างจาก Goods Receipt ตรงที่เป็น **single material per receiving** และ **update stock balance** ทันทีที่ confirm
> สิทธิ์ที่ใช้: `MATERIALS_RECEIVING_VIEW`, `MATERIALS_RECEIVING_CREATE`, `MATERIALS_RECEIVING_UPDATE`, `MATERIALS_RECEIVING_DELETE`, `MATERIALS_RECEIVING_CONFIRM`, `MATERIALS_RECEIVING_CANCEL`

| Method | Endpoint | Permission | Description |
|---|---|---|---|
| GET | `/materials-receiving` | `MATERIALS_RECEIVING_VIEW` | รายการรับเข้า (รองรับ `page`, `limit`, `search`, `status`, `supplierId`, `materialId`, `internalLotNo`, `receiveDateFrom`, `receiveDateTo`, `hasPackages`, `sortBy`, `sortOrder`) |
| GET | `/materials-receiving/lookups` | `MATERIALS_RECEIVING_VIEW` | ดึง suppliers / materials (พร้อม packingQuantity) / units สำหรับฟอร์ม |
| GET | `/materials-receiving/by-lot/:internalLotNo` | `MATERIALS_RECEIVING_VIEW` | ค้นหาด้วย Internal Lot No. (ใช้ตอน scan QR) คืน 404 ถ้าไม่พบ |
| GET | `/materials-receiving/:id` | `MATERIALS_RECEIVING_VIEW` | รายละเอียดการรับเข้า พร้อม `packages[]` และ relations |
| POST | `/materials-receiving` | `MATERIALS_RECEIVING_CREATE` | สร้าง draft + generate lot no + คำนวณ package + generate QR (รองรับ `idempotencyKey`) |
| PATCH | `/materials-receiving/:id` | `MATERIALS_RECEIVING_UPDATE` | แก้ draft (ต้องส่ง `updatedAt` เพื่อทำ optimistic concurrency check) |
| DELETE | `/materials-receiving/:id` | `MATERIALS_RECEIVING_DELETE` | ลบ draft เท่านั้น |
| POST | `/materials-receiving/:id/confirm` | `MATERIALS_RECEIVING_CONFIRM` | ยืนยันการรับเข้า → update `stock_balances` + บันทึก `stock_transactions` |
| POST | `/materials-receiving/:id/cancel` | `MATERIALS_RECEIVING_CANCEL` | ยกเลิก (ถ้าเคย confirm จะ revert stock ด้วย `transactionType=ADJUST`) |

### Internal Lot No. & Supplier Lot No.

| ประเภท | Format | กฎ |
|---|---|---|
| Internal Lot No. | `CCI-YYYYMMDD-XXX` | reset ทุกวัน, running 3 หลัก เริ่ม 001, จัดสรรผ่าน `material_receiving_lot_counters` ด้วย `pessimistic_write` lock |
| Supplier Lot No. | `SUP-YYYYMMDD` | generate จาก `supplierProductionDate` (ไม่มี running number) |

ตัวอย่าง:
```text
วันที่ 2026-08-09, รายการแรก: CCI-20260809-001
วันที่ 2026-08-09, รายการที่สอง: CCI-20260809-002
วันที่ 2026-08-10, รายการแรก: CCI-20260810-001   (running reset)

Supplier Production Date 2026-08-01 → SUP-20260801
```

### Package Calculation

```
packageCount = CEIL(receiveQuantity / materials.packingQuantity)
```

ตัวอย่าง `packingQuantity=200`, `receiveQuantity=1050` → 6 packages (5×200 + 1×50), และ `SUM(packages.quantity) = 1050`

### QR Code

QR Code (`qr_code`) เก็บเป็น base64 PNG ขนาด ~150px และ `qr_payload` เก็บข้อมูล JSONB ที่ scan ได้:

```json
{
  "version": "1.0",
  "internalLotNo": "CCI-20260809-001",
  "materialCode": "MAT-A",
  "receiveQuantity": "1000",
  "supplierLotNo": "SUP-20260801"
}
```

`internalLotNo` เป็นค่าหลักสำหรับ identify และค้นหากลับ ใช้ `GET /materials-receiving/by-lot/:internalLotNo`

### Query Parameters ของ `GET /materials-receiving`

| Param | Type | Default | หมายเหตุ |
|---|---|---|---|
| `page` | int ≥ 1 | `1` | หน้าที่ต้องการ |
| `limit` | int 1–100 | `20` | จำนวนต่อหน้า |
| `search` | string | — | ค้นหา `internalLotNo`, `supplierLotNo`, `material.code` (ILIKE) |
| `status` | enum | — | `draft` \| `confirmed` \| `cancelled` |
| `supplierId` | string (positive int) | — | กรองตาม supplier |
| `materialId` | string (positive int) | — | กรองตาม material |
| `internalLotNo` | `CCI-YYYYMMDD-XXX` | — | match แบบ exact |
| `receiveDateFrom` / `receiveDateTo` | `YYYY-MM-DD` | — | ช่วงวันที่รับ |
| `hasPackages` | bool | — | กรองตามการมี/ไม่มี package detail |
| `sortBy` | enum | `receiveDate` | `internalLotNo` \| `receiveDate` \| `supplierLotNo` \| `createdAt` \| `updatedAt` |
| `sortOrder` | enum | `desc` | `asc` \| `desc` |

### `POST /materials-receiving`

```json
{
  "materialId": "3",
  "supplierId": "2",
  "receiveQuantity": "1000",
  "supplierProductionDate": "2026-08-01",
  "receiveDate": "2026-08-09",
  "idempotencyKey": "order-20260809-001",
  "remark": "ฝากรับที่จุด A"
}
```

- `idempotencyKey` (optional) — ถ้าส่ง ระบบจะคืนใบรับเดิมที่สร้างด้วย key นี้แล้ว (ถ้ามี) เพื่อกันการสร้างซ้ำจาก retry
- `packingQuantityOverride` (optional) — ใช้กรณี materials.packing_quantity ยังว่าง หรือต้องการ snapshot ค่าต่างหาก
- ทุกครั้งที่สร้าง ระบบจะ: validate material + supplier + supplier_material mapping → snapshot `packingQuantity` → คำนวณ `packageCount` → generate `internalLotNo` (lock lot counter) → generate `supplierLotNo` → generate QR (base64 PNG) → save receiving + packages ทั้งหมดภายใน transaction เดียว

### `POST /materials-receiving/:id/confirm`

ยืนยันการรับเข้า (draft → confirmed) และ update stock:
- ล็อก `stock_balances` แถวของ material นั้นด้วย `pessimistic_write` แล้วบวก `receiveQuantity`
- บันทึก `stock_transactions` ที่ `transactionType=RECEIVE`, `referenceType=MATERIAL_RECEIVING`, `referenceLotNo=internalLotNo`
- กรอก `confirmedBy`, `confirmedAt`

### `POST /materials-receiving/:id/cancel`

```json
{ "cancelReason": "รับผิด material" }
```

- ถ้าเคย confirm → revert stock balance (ลบ receiveQuantity) + บันทึก `stock_transactions` ที่ `transactionType=ADJUST`, `quantityOut=receiveQuantity`
- ถ้ายังเป็น draft → เปลี่ยนสถานะอย่างเดียว ไม่แตะ stock
- `cancelReason` ต้องไม่ว่าง

### Error ที่พบบ่อยของ Materials Receiving

| Code | เมื่อไหร่ |
|---|---|
| `400` | validation ไม่ผ่าน, `receiveQuantity ≤ 0`, `receiveDate` เป็นอนาคต, material/supplier ไม่ active, material ไม่ได้ map กับ supplier ใน `supplier_materials`, `materials.packing_quantity` ว่างและไม่ส่ง `packingQuantityOverride` |
| `404` | ไม่พบ material receiving หรือ internal lot no |
| `409` | `internalLotNo` ซ้ำ (race condition), `idempotencyKey` ซ้ำ, `updatedAt` ไม่ตรง (optimistic lock), หรือ action ไม่ตรงสถานะ (เช่น confirm draft ที่ confirm แล้ว, cancel cancelled, แก้/ลบ receiving ที่ confirmed) |

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
