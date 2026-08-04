# Material Master Requirements

> สถานะ: Requirement ที่ยืนยันแล้ว ณ วันที่ 2 สิงหาคม 2026
> สถานะ Implementation: ✅ Implemented (CRUD + Image upload + Tests) — ดู [ส่วน 9](#9-implementation-status)
> ขอบเขต: ข้อมูลหลักวัตถุดิบและ Master Data ที่เกี่ยวข้องเท่านั้น

## 1. วัตถุประสงค์

Material Master ใช้เก็บข้อมูลหลักของวัตถุดิบที่บริษัทรับหรือสั่งซื้อจาก Supplier เช่น รหัส ชื่อ หน่วยนับ รูปแบบการจัดส่ง รุ่น จุดลงสินค้า ขนาด ไลน์กระบวนการ และรูปภาพ

ตาราง Material Master ต้องไม่เก็บข้อมูลที่เปลี่ยนแปลงในแต่ละครั้งที่รับสินค้า เช่น จำนวนรับ วันที่รับ เลข Lot ราคาซื้อ หรือยอดคงเหลือ

## 2. Schema และรายการตาราง

ใช้ PostgreSQL schema ชื่อ `master` และมีทั้งหมด 7 ตาราง:

```text
master
├── materials
├── units
├── delivery_types
├── material_models
├── loading_points
├── suppliers
└── supplier_materials
```

## 3. ความสัมพันธ์

```text
units             1 ─── N materials
delivery_types    1 ─── N materials
material_models   1 ─── N materials
loading_points    1 ─── N materials

materials         1 ─── N supplier_materials
suppliers         1 ─── N supplier_materials
```

- Material หนึ่งรายการมีหน่วยนับหลักเพียงหนึ่งหน่วย
- Material หนึ่งรายการมี Supplier ได้หลายราย
- Supplier หนึ่งรายจัดส่ง Material ได้หลายรายการ
- ความสัมพันธ์ระหว่าง Material และ Supplier ต้องเก็บผ่าน `supplier_materials`
- ห้ามเก็บรายการ Supplier เป็น JSON หรือหลายคอลัมน์ใน `materials`

## 4. ตาราง `master.materials`

เก็บข้อมูลหลักของวัตถุดิบ โดยใช้ `name` เพียงฟิลด์เดียว ไม่มี `name_th` และ `name_en`

| Column              | Type                                  | Required | รายละเอียด                                                     |
| ------------------- | ------------------------------------- | -------: | -------------------------------------------------------------- |
| `id`                | `BIGINT GENERATED ALWAYS AS IDENTITY` |      ใช่ | Primary Key                                                    |
| `code`              | `VARCHAR(50)`                         |      ใช่ | รหัสวัตถุดิบกลางของบริษัทและห้ามซ้ำ                            |
| `name`              | `VARCHAR(255)`                        |      ใช่ | ชื่อวัตถุดิบ                                                   |
| `unit_id`           | `BIGINT`                              |      ใช่ | Foreign Key ไป `master.units.id`                               |
| `delivery_type_id`  | `BIGINT`                              |      ไม่ | Foreign Key ไป `master.delivery_types.id`                      |
| `model_id`          | `BIGINT`                              |      ไม่ | Foreign Key ไป `master.material_models.id`                     |
| `loading_point_id`  | `BIGINT`                              |      ไม่ | Foreign Key ไป `master.loading_points.id`                      |
| `process_line_name` | `VARCHAR(255)`                        |      ไม่ | ชื่อไลน์หรือกระบวนการผลิต เก็บเป็นข้อความโดยไม่แยก Master Data |
| `scale`             | `VARCHAR(255)`                        |      ไม่ | ขนาด เก็บเป็นข้อความ เช่น `กว้าง 50 × ยาว 100 × สูง 20 ซม.`    |
| `image_path`        | `VARCHAR(500)`                        |      ไม่ | Path หรือ URL ของรูปภาพหนึ่งรูป                                |
| `specification`     | `TEXT`                                |      ไม่ | คุณสมบัติหรือสเปกวัตถุดิบ                                      |
| `description`       | `TEXT`                                |      ไม่ | รายละเอียดเพิ่มเติม                                            |
| `is_active`         | `BOOLEAN`                             |      ใช่ | สถานะใช้งาน ค่าเริ่มต้น `true`                                 |
| `created_by`        | `BIGINT`                              |      ไม่ | ผู้สร้างข้อมูล                                                 |
| `updated_by`        | `BIGINT`                              |      ไม่ | ผู้แก้ไขล่าสุด                                                 |
| `created_at`        | `TIMESTAMP`                           |      ใช่ | วันเวลาที่สร้าง                                                |
| `updated_at`        | `TIMESTAMP`                           |      ใช่ | วันเวลาที่แก้ไขล่าสุด                                          |

ข้อกำหนดสำคัญ:

- `code` เป็นรหัสกลางเพียงรหัสเดียว ไม่เก็บรหัสแยกตาม Supplier
- `code` ต้องมี Unique Constraint
- `delivery_type_id`, `model_id`, `loading_point_id`, `process_line_name`, `scale` และ `image_path` เป็น Nullable เพื่อเพิ่มข้อมูลภายหลังได้
- รูปภาพเป็นความสัมพันธ์แบบ 1:1 กับ Material และเก็บเฉพาะตำแหน่งไฟล์ ไม่เก็บ Base64 หรือ Binary ใน PostgreSQL
- ไม่มี `process_line_id` และไม่มีตาราง `process_lines`

## 5. ตาราง Master Data ประกอบ

### 5.1 `master.units`

เก็บหน่วยนับหลัก เช่น `KG`, `PCS` และ `L`

```text
id
code
name_th
name_en
symbol
description
is_active
created_by
updated_by
created_at
updated_at
```

`code` ต้องไม่ซ้ำ

### 5.2 `master.delivery_types`

เก็บรูปแบบการจัดส่ง เช่น รถบรรทุก, Tanker หรือ Container

```text
id
code
name_th
name_en
description
is_active
created_by
updated_by
created_at
updated_at
```

`code` ต้องไม่ซ้ำ

### 5.3 `master.material_models`

เก็บรุ่นหรือแบบของวัตถุดิบ

```text
id
code
name_th
name_en
description
is_active
created_by
updated_by
created_at
updated_at
```

`code` ต้องไม่ซ้ำ

### 5.4 `master.loading_points`

เก็บจุดรับหรือจุดลงวัตถุดิบ เช่น Receiving Area A หรือ Tank Farm

```text
id
code
name_th
name_en
description
is_active
created_by
updated_by
created_at
updated_at
```

`code` ต้องไม่ซ้ำ

### 5.5 `master.suppliers`

เก็บข้อมูลหลักของ Supplier

```text
id
code
name_th
name_en
tax_id
contact_name
telephone
email
address
is_active
created_by
updated_by
created_at
updated_at
```

`code` ต้องไม่ซ้ำ ส่วน `name_en`, `tax_id` และข้อมูลติดต่อเป็น Nullable

## 6. ตาราง `master.supplier_materials`

ตารางกลางสำหรับความสัมพันธ์แบบ Many-to-Many ระหว่าง Material และ Supplier

| Column        | Type                                  | Required | รายละเอียด                           |
| ------------- | ------------------------------------- | -------: | ------------------------------------ |
| `id`          | `BIGINT GENERATED ALWAYS AS IDENTITY` |      ใช่ | Primary Key                          |
| `material_id` | `BIGINT`                              |      ใช่ | Foreign Key ไป `master.materials.id` |
| `supplier_id` | `BIGINT`                              |      ใช่ | Foreign Key ไป `master.suppliers.id` |
| `is_active`   | `BOOLEAN`                             |      ใช่ | สถานะความสัมพันธ์ ค่าเริ่มต้น `true` |
| `created_by`  | `BIGINT`                              |      ไม่ | ผู้สร้างข้อมูล                       |
| `updated_by`  | `BIGINT`                              |      ไม่ | ผู้แก้ไขล่าสุด                       |
| `created_at`  | `TIMESTAMP`                           |      ใช่ | วันเวลาที่สร้าง                      |
| `updated_at`  | `TIMESTAMP`                           |      ใช่ | วันเวลาที่แก้ไขล่าสุด                |

ต้องกำหนด `UNIQUE (material_id, supplier_id)` เพื่อป้องกันการผูก Material กับ Supplier รายเดิมซ้ำ

## 7. กฎการใช้งาน Master Data

- ใช้ `is_active = false` เพื่อปิดการใช้งานข้อมูลแทนการลบข้อมูลที่ถูกอ้างอิง
- การปิด Supplier ต้องไม่ทำให้ Material ถูกปิดตาม
- การปิด Material ต้องไม่ลบความสัมพันธ์หรือประวัติที่เกี่ยวข้อง
- API สามารถแสดงรายการ Supplier ภายในผลลัพธ์ Material ได้ แต่ต้องอ่านความสัมพันธ์จาก `supplier_materials`
- ทุกตารางใช้ชื่อคอลัมน์ในฐานข้อมูลแบบ `snake_case` และ TypeORM properties แบบ `camelCase`

## 8. ข้อมูลที่อยู่นอกขอบเขต

ข้อมูลต่อไปนี้ไม่ใช่ Material Master และต้องออกแบบเป็นตารางธุรกรรมหรือ Stock แยกต่างหาก:

- Minimum Stock — ยังไม่สรุปว่าจะกำหนดรวมทั้งระบบหรือแยกตามคลัง
- Current Stock และยอดคงเหลือ
- จำนวนและวันที่รับวัตถุดิบ
- Purchase Order และเลขเอกสารรับสินค้า
- ราคาซื้อในแต่ละครั้ง
- เลข Lot
- วันผลิตและวันหมดอายุ
- คลังหรือพื้นที่จัดเก็บ
- ประวัติการเคลื่อนไหวสต็อก

การเพิ่มข้อมูลเหล่านี้ในอนาคตต้องไม่ย้ายข้อมูลธุรกรรมมาเก็บใน `master.materials`

## 9. Implementation Status

Requirement ในเอกสารนี้ถูก implement แล้วตามแผน `docs/superpowers/plans/2026-08-02-material-master.md` และครอบคลุม CRUD + Image upload + Unit tests ครบทุก entity

### 9.1 ไฟล์ที่เกี่ยวข้อง

| Layer | ไฟล์ |
| --- | --- |
| Migration | `src/database/migrations/1700000000005-CreateMaterialMaster.ts` |
| Entities | `src/entities/master/{material,unit,delivery-type,material-model,loading-point,supplier,supplier-material}.entity.ts` |
| Module | `src/modules/materials/materials.module.ts` |
| Service | `src/modules/materials/materials.service.ts` (create, update, deactivate, restore, findAll, findOne, getLookups) |
| Controller | `src/modules/materials/materials.controller.ts` (REST endpoints + image upload) |
| Image storage | `src/modules/materials/material-image-storage.service.ts` (stage → promote → discard) |
| DTOs | `src/modules/materials/dto/{create-material,update-material,list-materials-query}.dto.ts` |
| Permissions | `src/modules/materials/material-permissions.ts` (`MATERIAL_VIEW`/`CREATE`/`UPDATE`/`DELETE`) |
| Tests | `src/database/migrations/1700000000005-CreateMaterialMaster.spec.ts`, `src/entities/master/*.spec.ts`, `src/modules/materials/*.spec.ts` |

### 9.2 REST Endpoints

| Method | Path | Permission | คำอธิบาย |
| --- | --- | --- | --- |
| GET | `/materials` | `MATERIAL_VIEW` | รายการ Material พร้อม filter/sort/pagination |
| GET | `/materials/lookups` | `MATERIAL_VIEW` | Lookup Master Data ทั้งหมด (สำหรับฟอร์ม) |
| GET | `/materials/:id` | `MATERIAL_VIEW` | ข้อมูล Material ตาม id |
| POST | `/materials` | `MATERIAL_CREATE` | สร้าง Material |
| PATCH | `/materials/:id` | `MATERIAL_UPDATE` | แก้ไข (ต้องส่ง `updatedAt` เพื่อ optimistic concurrency) |
| DELETE | `/materials/:id` | `MATERIAL_DELETE` | Soft delete (`isActive = false`) |
| PATCH | `/materials/:id/restore` | `MATERIAL_UPDATE` | Restore Material |
| POST | `/materials/images` | `MATERIAL_CREATE` หรือ `MATERIAL_UPDATE` | อัปโหลดรูป (multipart) → ได้ `imagePath` ชั่วคราว |

> ดู request/response ตัวอย่างทั้งหมดได้ที่ `API_ENDPOINTS.md` ส่วน **Materials**

### 9.3 แนวปฏิบัติที่ใช้ในการ Implement

- ใช้ `DataSource.transaction()` ครอบ create/update/deactivate/restore เพื่อรักษาความ consistent ระหว่าง `materials` กับ `supplier_materials`
- ใช้ `pessimistic_write` lock ตอน update เพื่อกัน concurrent write
- ใช้ optimistic concurrency ผ่าน field `updatedAt` ใน `UpdateMaterialDto` (ตอบ `409 Conflict` ถ้าไม่ตรง)
- `MaterialImageStorageService` แยกเป็น 2 phase (`stage` → `promote`) เพื่อให้ compensate ไฟล์ได้เมื่อ transaction fail
- Validate magic bytes (JPEG/PNG/WEBP) และขนาดไม่เกิน 5 MiB ตอน stage
- ไฟล์ใน `.tmp/` จะถูกลบอัตโนมัติหลัง 24 ชั่วโมงหากไม่ถูก promote
- Lookup list query (`GET /materials/lookups`) คืนเฉพาะ `isActive = true` เรียงตาม `code ASC`
- `code` ใน Material ถูก trim + uppercase อัตโนมัติ และเช็ค unique แบบ case-insensitive
- การ filter `supplierId` ใน list ใช้ EXISTS subquery กับ `master.supplier_materials` และกรองเฉพาะ mapping/supplier ที่ active

### 9.4 เอกสารที่เกี่ยวข้อง

- [PROJECT-WIKI.md §6.10 MaterialsModule](../PROJECT-WIKI.md#610-materialsmodule) — ภาพรวม module + dependency
- [PROJECT-WIKI.md §3.3 Material Master Entities](../PROJECT-WIKI.md#33-material-master-entities-7-tables) — data model
- [API_ENDPOINTS.md §Materials](../API_ENDPOINTS.md#materials) — REST contract
- [Implementation Plan](../superpowers/plans/2026-08-02-material-master.md) — แผนงานตั้งต้นที่ใช้ implement
