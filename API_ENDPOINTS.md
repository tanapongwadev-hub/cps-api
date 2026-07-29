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
| GET | `/users/:id/assignments` | Bearer + SUPER_ADMIN | ดึง assignments ของผู้ใช้ |
| POST | `/users/:id/assignments` | Bearer + SUPER_ADMIN | สร้าง assignment ใหม่ |

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
