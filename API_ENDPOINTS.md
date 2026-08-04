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
| GET | `/roles` | Bearer + SUPER_ADMIN | รายการบทบาท (รองรับ `page`, `limit`, `search`) |
| GET | `/roles/:id` | Bearer + SUPER_ADMIN | ข้อมูลบทบาท |
| POST | `/roles` | Bearer + SUPER_ADMIN | สร้างบทบาท |
| PATCH | `/roles/:id` | Bearer + SUPER_ADMIN | แก้ไขบทบาท |
| DELETE | `/roles/:id` | Bearer + SUPER_ADMIN | ลบบทบาท |

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
| GET | `/permissions/:id` | Bearer + SUPER_ADMIN | ข้อมูล permission พร้อม `departments` |
| PUT | `/permissions/:id/departments` | Bearer + SUPER_ADMIN | กำหนดแผนกที่ใช้ permission ได้ |

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

## Root

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/` | Public | Hello message จาก `AppController` (default NestJS) |

## คำอธิบาย Auth

- **Public** — ไม่ต้องส่ง token
- **Bearer** — ต้องส่ง `Authorization: Bearer <accessToken>`
- **Bearer + SUPER_ADMIN** — ต้องส่ง token และผู้ใช้ต้องมี role `SUPER_ADMIN`

## Query Parameters ทั่วไป

สำหรับ endpoints รายการที่รองรับ pagination:
- `page` — หน้าที่ต้องการ (default: 1)
- `limit` — จำนวนต่อหน้า (default: 20)
