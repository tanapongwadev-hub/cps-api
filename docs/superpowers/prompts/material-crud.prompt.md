# Material Master CRUD — Code Generation Prompt

> **วิธีใช้:** คัดลอก prompt ทั้งหมดในไฟล์นี้ตั้งแต่หัวข้อ "🎯 Prompt" ไปจนถึงท้ายไฟล์ แล้วส่งให้ LLM (เช่น Mavis/Cursor/Copilot) เพื่อให้ generate CRUD module ตาม requirement
>
> **หมายเหตุ:** Prompt นี้ออกแบบมาให้ self-contained — ผู้ที่อ่านต้องไม่ต้องเปิดไฟล์อื่นของโปรเจกต์เพิ่ม ยกเว้นจะระบุ path อ้างอิงไว้

---

## 🎯 Prompt

คุณคือ Senior NestJS Engineer ที่จะ implement **Material Master CRUD module** ให้กับโปรเจกต์ `cps-api` ให้ทำงานตาม spec ด้านล่างนี้ให้สมบูรณ์ในครั้งเดียว พร้อม test, documentation และ commit message

### 1. Context & Stack

- **Project:** `cps-api` — NestJS 11 + TypeScript 5.7 + TypeORM 0.3 + PostgreSQL 14+ + Jest 30
- **Package manager:** pnpm (ใช้ `pnpm.cmd` บน Windows)
- **Shell:** PowerShell (ห้ามใช้ `&&` หรือ bash backtick escapes)
- **Existing modules ที่ต้องอ้างอิง pattern:** `src/modules/departments/` (CRUD พื้นฐาน) และ `src/modules/users/` (CRUD + aggregate)
- **ก่อนเริ่มเขียน code ทุกครั้ง ต้องอ่าน:**
  - `PROJECT-WIKI.md` (architecture, conventions, forbidden patterns)
  - `API_ENDPOINTS.md` (REST contract ที่ใช้ในโปรเจกต์)
  - `docs/wiki/material-master.md` (requirement หลักของ feature นี้)
  - ไฟล์ตัวอย่างจริง: `src/modules/departments/*` และ `src/entities/iam/user.entity.ts`

### 2. Hard Conventions (ทำตามนี้เป๊ะ ไม่งั้น PR ไม่ผ่าน)

#### 2.1 Naming
- **DB column:** `snake_case` (เช่น `unit_id`, `process_line_name`, `is_active`)
- **TypeORM property / TS field:** `camelCase` (เช่น `unitId`, `processLineName`, `isActive`)
- **Entity class:** `PascalCase` (เช่น `Material`, `SupplierMaterial`)
- **Table name:** `snake_case` ในรูปพหูพจน์ (เช่น `materials`, `supplier_materials`)
- **Schema:** `master` (ห้ามสร้าง schema ใหม่)

#### 2.2 ID Type
- ทุก primary key เป็น `BIGINT GENERATED ALWAYS AS IDENTITY` ใน DB
- ใน TypeORM ใช้ `@PrimaryGeneratedColumn('increment', { type: 'bigint' })`
- ใน TypeScript property เป็น `string` (ไม่ใช่ `number`) เพราะ JS Number ไม่รองรับ bigint ปลอดภัย
- FK columns ก็ใช้ `bigint` และ `string` เช่นกัน

#### 2.3 Audit Fields
ทุก entity ที่เป็น master data ต้องมี field เหล่านี้ครบ:
- `createdBy: string | null` (nullable bigint → `created_by`)
- `updatedBy: string | null` (nullable bigint → `updated_by`)
- `createdAt: Date` (`@CreateDateColumn({ name: 'created_at' })`)
- `updatedAt: Date` (`@UpdateDateColumn({ name: 'updated_at' })`)
- `isActive: boolean` (`@Column({ name: 'is_active', type: 'boolean', default: true })`)

#### 2.4 Schema Constraints
- ทุก lookup table (`units`, `delivery_types`, `material_models`, `loading_points`, `suppliers`) ต้องมี `@Index(['code'], { unique: true })`
- `supplier_materials` ต้องมี `@Index(['materialId', 'supplierId'], { unique: true })`
- ทุก FK column ใส่ `@Index()` เพื่อ performance
- ทุก FK ใช้ `onDelete: 'RESTRICT'` ห้ามใช้ `CASCADE` หรือ `SET NULL`
- ห้ามสร้างตาราง `process_lines` หรือ column `process_line_id` (ใช้ `process_line_name` เป็น text แทน)
- ห้ามเพิ่ม field เกี่ยวกับ transaction เช่น stock, lot, price, expiry ใน `materials`

#### 2.5 DTO Patterns
- ใช้ `class-validator` + `class-transformer`
- ทุก string field ที่จะ trim ให้ใช้ custom `Transform` (ดู helper ด้านล่าง)
- ID fields ใช้ `@Matches(/^[1-9]\d*$/)` เพื่อรับเฉพาะ positive integer string
- Nullable optional string ใช้ `nullableTrimmedString` (คืน `null` ถ้า trim แล้วเป็น empty string)
- Array of ID ใช้ `@IsArray`, `@ArrayUnique`, `@IsString({ each: true })`, `@Matches(POSITIVE_DECIMAL_ID, { each: true })`
- `updatedAt` ใน UpdateDto ใช้ `@IsISO8601({ strict: true })` และเป็น required (ไม่ใช่ optional)
- `boolean` ใน query string ใช้ custom `queryBoolean` Transform เพื่อแปลง `'true'/'false'` string

DTO helper (copy ไปใช้ในทุก DTO ใน module นี้):

```ts
import { Transform, TransformFnParams } from 'class-transformer';

const POSITIVE_DECIMAL_ID = /^[1-9]\d*$/;

function sourceValue(params: TransformFnParams): unknown {
  const source: unknown = params.obj;
  if (
    source !== null &&
    typeof source === 'object' &&
    Object.prototype.hasOwnProperty.call(source, params.key)
  ) {
    return Reflect.get(source, params.key);
  }
  return params.value;
}

function trimString(params: TransformFnParams): unknown {
  const value = sourceValue(params);
  return typeof value === 'string' ? value.trim() : value;
}

function nullableTrimmedString(params: TransformFnParams): unknown {
  const value = sourceValue(params);
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function trimStringArray(params: TransformFnParams): unknown {
  const value = sourceValue(params);
  if (!Array.isArray(value)) return value;
  return value.map((item) => (typeof item === 'string' ? item.trim() : item));
}

function queryBoolean(params: TransformFnParams): unknown {
  const value = sourceValue(params);
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}
```

#### 2.6 Service Patterns
- Inject repositories ผ่าน `@InjectRepository(Entity)` ทุกตัวที่ใช้
- ถ้ามี transaction ให้ inject `DataSource` แบบ optional แล้วเรียก `dataSource.transaction(async (manager) => { ... })`
- ทุก write operation ต้องอยู่ใน transaction (create / update / deactivate / restore)
- Update operation ใช้ `pessimistic_write` lock เพื่อกัน concurrent write
- ก่อน update ต้องเช็ค optimistic concurrency: เทียบ `dto.updatedAt` กับ `entity.updatedAt` (ใช้ `getTime()` เปรียบเทียบ) ถ้าไม่ตรง → `throw new ConflictException('Material has been updated')`
- Catch `23505` (PostgreSQL unique violation) แล้วแปลงเป็น `ConflictException` (ป้องกัน race condition ที่ pre-check ผ่านแต่ insert ชน)
- ทุก reference FK (unit, supplier, model, deliveryType, loadingPoint) ต้อง validate ว่า `isActive = true` ก่อน save
- การ update supplier list ใช้ sync pattern: เปรียบเทียบ existing vs requested, soft-delete ที่หายไป, restore/create ที่เพิ่มใหม่

#### 2.7 Controller Patterns
- Decorator order (top to bottom): `@Controller()`, `@UseGuards()`, class, `@Get/@Post/@Patch/@Delete()`, `@RequirePermissions/@RequireAnyPermissions`
- ใช้ `JwtAuthGuard`, `ActiveAssignmentGuard`, `PermissionGuard` ผ่าน `@UseGuards(JwtAuthGuard, ActiveAssignmentGuard, PermissionGuard)` ที่ class level
- ดึง user id ด้วย `@CurrentUser('id') userId: string`
- ใช้ `@RequirePermissions(MATERIAL_PERMISSIONS.VIEW/CREATE/UPDATE/DELETE)` ที่ method level
- ใช้ `@RequireAnyPermissions` เมื่อต้องการ "ตัวใดตัวหนึ่ง" (เช่น image upload ต้องการ CREATE หรือ UPDATE)
- ไม่ return entity โดยตรง — ใช้ DTO หรือ map suppliers/materials ให้ flatten relations
- `DELETE /:id` ต้องเป็น soft delete (set `isActive = false`) ไม่ใช่ hard delete
- เพิ่ม `PATCH /:id/restore` endpoint สำหรับ restore ที่ถูก soft delete

#### 2.8 File Structure
```
src/database/migrations/<timestamp>-CreateMaterialMaster.ts
src/database/migrations/<timestamp>-CreateMaterialMaster.spec.ts
src/entities/master/unit.entity.ts
src/entities/master/delivery-type.entity.ts
src/entities/master/material-model.entity.ts
src/entities/master/loading-point.entity.ts
src/entities/master/material.entity.ts
src/entities/master/supplier.entity.ts
src/entities/master/supplier-material.entity.ts
src/entities/master/master-lookups.entity.spec.ts
src/entities/master/material.entity.spec.ts
src/entities/master/supplier.entity.spec.ts
src/entities/master/supplier-material.entity.spec.ts
src/modules/materials/materials.module.ts
src/modules/materials/materials.controller.ts
src/modules/materials/materials.service.ts
src/modules/materials/materials.aggregate.spec.ts (integration test for create/update)
src/modules/materials/materials.controller.spec.ts
src/modules/materials/materials.service.spec.ts
src/modules/materials/materials.module.spec.ts
src/modules/materials/material-permissions.ts
src/modules/materials/material-image-storage.service.ts
src/modules/materials/material-image-storage.service.spec.ts
src/modules/materials/material-permissions.spec.ts
src/modules/materials/dto/create-material.dto.ts
src/modules/materials/dto/update-material.dto.ts
src/modules/materials/dto/list-materials-query.dto.ts
src/modules/materials/dto/material.dto.spec.ts
```

แล้วเพิ่ม `MaterialsModule` ใน `src/app.module.ts` imports

### 3. Functional Requirements (จาก docs/wiki/material-master.md)

#### 3.1 Schema (PostgreSQL, schema = `master`)
7 ตาราง: `units`, `delivery_types`, `material_models`, `loading_points`, `suppliers`, `materials`, `supplier_materials`

#### 3.2 Material Columns (เป๊ะตามนี้)
- `id` BIGINT IDENTITY PK
- `code` VARCHAR(50) UNIQUE NOT NULL
- `name` VARCHAR(255) NOT NULL (มีแค่ฟิลด์เดียว ไม่มี name_th/name_en)
- `unit_id` BIGINT NOT NULL → `units.id` (RESTRICT)
- `delivery_type_id` BIGINT NULL → `delivery_types.id` (RESTRICT)
- `model_id` BIGINT NULL → `material_models.id` (RESTRICT)
- `loading_point_id` BIGINT NULL → `loading_points.id` (RESTRICT)
- `process_line_name` VARCHAR(255) NULL (text ไม่ใช่ FK)
- `scale` VARCHAR(255) NULL
- `image_path` VARCHAR(500) NULL (path/URL เดียว ไม่ใช่ binary/Base64)
- `specification` TEXT NULL
- `description` TEXT NULL
- `is_active` BOOLEAN DEFAULT true
- `created_by`, `updated_by` BIGINT NULL
- `created_at`, `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP

#### 3.3 Supplier Columns
- `id`, `code` UNIQUE, `name_th` required, `name_en` NULL, `tax_id` NULL, `contact_name` NULL, `telephone` NULL, `email` NULL, `address` NULL, audit fields, `is_active`

#### 3.4 SupplierMaterial (join table)
- `id`, `material_id`, `supplier_id`, `is_active`, audit fields
- `UNIQUE (material_id, supplier_id)`

#### 3.5 Unit Columns
- `id`, `code` UNIQUE, `name_th` required, `name_en` NULL, `symbol` NULL, `description` NULL, audit fields, `is_active`

#### 3.6 DeliveryType / MaterialModel / LoadingPoint
- `id`, `code` UNIQUE, `name_th` required, `name_en` NULL, `description` NULL, audit fields, `is_active`

### 4. REST API Contract

| Method | Path | Permission | Behavior |
| --- | --- | --- | --- |
| GET | `/materials` | `MATERIAL_VIEW` | list + filter (search, isActive, unitId, modelId, deliveryTypeId, loadingPointId, supplierId) + sort (code, name, isActive, createdAt, updatedAt) + paginate (page, limit default 1/20, max 100) |
| GET | `/materials/lookups` | `MATERIAL_VIEW` | คืน active units, suppliers, models, deliveryTypes, loadingPoints ทั้งหมด เรียงตาม code |
| GET | `/materials/:id` | `MATERIAL_VIEW` | คืน Material + lookup relations + suppliers (เฉพาะ active) |
| POST | `/materials` | `MATERIAL_CREATE` | สร้าง Material (code auto-uppercase + trim) + supplier mappings ใน transaction เดียว |
| PATCH | `/materials/:id` | `MATERIAL_UPDATE` | update + sync supplier mappings; ต้องส่ง `updatedAt` เพื่อ optimistic concurrency |
| DELETE | `/materials/:id` | `MATERIAL_DELETE` | soft delete (`isActive = false`) ไม่ลบ mappings |
| PATCH | `/materials/:id/restore` | `MATERIAL_UPDATE` | restore ที่ soft delete |
| POST | `/materials/images` | `MATERIAL_CREATE` หรือ `MATERIAL_UPDATE` | multipart upload → return `{ imagePath, previewUrl }` (path ชั่วคราวใน `.tmp/`) |

### 5. Image Storage Service

- `stage(file)`: validate MIME (`image/jpeg|png|webp`), validate magic bytes, validate size ≤ 5 MiB, เขียนลง `<root>/.tmp/<uuid>.<ext>`, คืน `imagePath = /uploads/materials/.tmp/<uuid>.<ext>`
- `promote(imagePath)`: ตรวจ path ตรง pattern, rename จาก `.tmp/` ไป root, คืน `imagePath` ใหม่
- `discard(imagePath)`: ลบไฟล์ (ใช้เมื่อ compensate หรือลบรูปเก่าหลัง update สำเร็จ)
- `cleanupStaleTemporaryFiles()`: ลบไฟล์ใน `.tmp/` ที่อายุเกิน 24 ชม.
- ป้องกัน path traversal: `resolveMaterialPath()` ต้อง reject ถ้า `relative()` ออกนอก root

ใน `MaterialsService` ใช้ pattern:
1. Promote image ก่อน save (ถ้ามี imagePath ใหม่)
2. Save material ใน transaction
3. ถ้า fail ทุกขั้นตอน → compensate ด้วย `discard(promotedPath)` (best-effort, log ถ้า fail)
4. ถ้า success แต่มีการเปลี่ยนรูป → discard ไฟล์เก่า หลัง transaction commit

### 6. Test Patterns (Jest)

#### 6.1 Migration Test
ใช้ `jest.fn().mockResolvedValue(undefined)` แทน `query` แล้ว join `mock.calls` เพื่อ assert SQL keywords:

```ts
const query = jest.fn().mockResolvedValue(undefined);
const migration = new CreateMaterialMaster1700000000005();
await migration.up({ query } as never);
const sql = query.mock.calls.map(([statement]) => statement).join('\n');
expect(sql).toContain('CREATE SCHEMA IF NOT EXISTS master');
expect(sql).toContain('UNIQUE (material_id, supplier_id)');
// etc.
```

Test `down()` ต้อง assert ลำดับ drop: supplier_materials → materials → suppliers → ... (ตาม dependency) และ `DROP SCHEMA IF EXISTS master` โดยไม่มี `CASCADE`

#### 6.2 Entity Test
ใช้ `getMetadataArgsStorage()` แล้ว assert:
- `target === Entity` และ `name === 'snake_case_table'`, `schema === 'master'`
- `unique === true` สำหรับ code index
- column metadata (name, type, length, nullable) ตรง spec
- ไม่มี property เช่น `nameTh`, `nameEn`, `processLineId` ใน Material
- relations ใช้ join column name ที่ถูก (`unit_id`, `delivery_type_id` ฯลฯ)

#### 6.3 Service Test
ใช้ `Test.createTestingModule` + mock repository (factory pattern) แล้ว test:
- create: validate references, normalize code, save with audit fields, sync supplier mappings
- update: optimistic concurrency (throw ConflictException ถ้า updatedAt ไม่ตรง), pessimistic lock, image promote + discard
- findAll: filter combinations, sort, pagination, EXISTS subquery สำหรับ supplierId
- getLookups: คืน 5 lookup lists เฉพาะ active เรียงตาม code

### 7. Documentation Tasks

หลังเขียน code เสร็จ ต้องอัพเดตเอกสารเหล่านี้:

1. **`PROJECT-WIKI.md`**:
   - เพิ่ม row `MaterialsModule` ในตาราง Section 6.0 Module Dependency Map
   - เพิ่ม `MaterialsModule` ใน AppModule imports row
   - เพิ่ม Section 6.10 MaterialsModule อธิบาย architecture, transaction pattern, image storage, soft delete
2. **`API_ENDPOINTS.md`**:
   - เพิ่ม Section "Materials" พร้อมตาราง endpoint + query parameters + request/response example
3. **`docs/wiki/material-master.md`**:
   - เปลี่ยนสถานะเป็น "✅ Implemented"
   - เพิ่ม Section 9 Implementation Status พร้อม file map และ REST contract

### 8. Workflow (ทำตามลำดับนี้)

1. สร้าง migration และ migration spec (red → green)
2. สร้าง lookup entities + spec
3. สร้าง material + supplier entities + spec
4. เพิ่ม supplier-material association + แก้ material/supplier ให้มี OneToMany
5. สร้าง DTOs + permissions
6. สร้าง MaterialImageStorageService + spec
7. สร้าง MaterialsService + spec
8. สร้าง MaterialsController + spec
9. สร้าง MaterialsModule + spec + register ใน AppModule
10. อัพเดต PROJECT-WIKI.md, API_ENDPOINTS.md, material-master.md
11. รัน `pnpm test --runInBand` ทั้งหมด
12. รัน `pnpm build`
13. รัน `pnpm exec eslint "src/entities/master/**/*.ts" "src/database/migrations/*CreateMaterialMaster*.ts" "src/modules/materials/**/*.ts"`
14. รัน `pnpm exec prettier --check <files...>`
15. Commit เป็น 4 commits แยกตาม layer (migration / entities / service / docs) — ใช้ conventional commit format

### 9. Forbidden Patterns (จะเจอใน review = reject)

- ❌ ใช้ `synchronize: true` ใน TypeORM config
- ❌ สร้างตาราง `process_lines` หรือ column `process_line_id`
- ❌ เพิ่ม field `name_th`/`name_en` ใน Material
- ❌ เก็บ supplier list เป็น JSON หรือ multiple columns ใน Material
- ❌ ใช้ `onDelete: 'CASCADE'` หรือ `'SET NULL'` ใน FK
- ❌ Hard delete Material (ต้อง soft delete ผ่าน `isActive`)
- ❌ เก็บรูปภาพเป็น Base64 หรือ bytea ใน DB
- ❌ ใช้ `as any` หรือ type cast ที่หลวม
- ❌ Default password/secret ใน source code
- ❌ Migration แบบ DROP CASCADE
- ❌ เพิ่ม field transaction เช่น stock, lot, price, expiry ใน Material

### 10. Acceptance Criteria

PR จะ merge ได้ก็ต่อเมื่อ:

- ✅ Migration สร้าง 7 ตารางตาม spec และลำดับ drop ถูกต้อง
- ✅ Material entity ไม่มี `nameTh`/`nameEn`/`processLineId`
- ✅ Optional Material fields (delivery_type_id, model_id, loading_point_id, process_line_name, scale, image_path) เป็น nullable ทั้งหมด
- ✅ `UNIQUE` constraint มีทั้งใน SQL migration และ TypeORM metadata
- ✅ Endpoint ทุกตัวทำงานตามตารางใน Section 4
- ✅ Optimistic concurrency ใช้งานได้ (ทดสอบโดย PATCH ด้วย updatedAt เก่า → 409)
- ✅ Image upload 2-phase (stage + promote) ทำงานและ compensate เมื่อ transaction fail
- ✅ Soft delete ไม่ลบ supplier mappings
- ✅ `pnpm test` ผ่าน 100%
- ✅ `pnpm build` สำเร็จ (exit 0)
- ✅ `pnpm exec eslint` ไม่มี error
- ✅ `pnpm exec prettier --check` ผ่าน
- ✅ `PROJECT-WIKI.md`, `API_ENDPOINTS.md`, `docs/wiki/material-master.md` อัพเดตแล้ว

### 11. Deliverables Format (ส่งคืน)

เมื่อทำเสร็จ ให้ส่งคืนด้วย format นี้:

1. **สรุปงาน** — 2-3 bullet ว่าทำอะไรไปบ้าง
2. **ไฟล์ที่สร้าง/แก้** — bullet list พร้อม path
3. **ผลการรัน** — `pnpm test`, `pnpm build`, `pnpm exec eslint`, `pnpm exec prettier --check` (แค่ exit code + จำนวน test ผ่าน)
4. **Commit message ที่ใช้** — 4 commit messages แยกตาม layer
5. **Documentation diff** — สรุปสั้นๆ ว่าแก้ PROJECT-WIKI/API_ENDPOINTS/material-master ตรงไหน
6. **Known issues / TODO** — ถ้ามี

ห้ามคัดลอก code ทั้งหมดลงใน response — ให้สรุป architecture และ file path แทน

---

## 📎 Reference Files (อ่านเพิ่มถ้าต้องการ context)

- Requirement: `docs/wiki/material-master.md`
- Existing CRUD pattern (อ่านก่อน): `src/modules/departments/*`
- Aggregate CRUD pattern (อ่านก่อน): `src/modules/users/*`
- Project conventions: `PROJECT-WIKI.md` (sections 0, 2, 6, 12)
- Existing entities: `src/entities/iam/user.entity.ts`, `src/entities/iam/department.entity.ts`
- Permission pattern: `src/modules/permissions/*` (read-only module ใช้เป็นตัวอย่าง readonly pattern)
