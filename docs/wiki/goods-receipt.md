# Goods Receipt Requirements

> สถานะ: Requirement ที่ยืนยันแล้ว ณ วันที่ 8 สิงหาคม 2026
> สถานะ Implementation: ✅ Implemented — migration, entities, CRUD + post/cancel, ไฟล์แนบ, seed registry และ unit tests ครบ
> ที่มา: สกัดจากการ grilling 28 การตัดสินใจ ต่อยอดจาก [Material Master Requirements](material-master.md) §8

## 1. วัตถุประสงค์

Goods Receipt ใช้บันทึกเอกสารการรับวัตถุดิบจาก Supplier เข้าโรงงาน เพื่อตอบคำถามว่า **รับอะไรมาเท่าไหร่ จากใคร เมื่อไหร่ และปฏิเสธอะไรไปเพราะอะไร**

เอกสารนี้ครอบคลุมข้อมูลที่ [Material Master §8](material-master.md#8-ข้อมูลที่อยู่นอกขอบเขต) กันออกไปเป็นตารางธุรกรรม เฉพาะส่วนที่เกี่ยวกับการรับเข้า

## 2. ขอบเขต

### 2.1 อยู่ในขอบเขต

- เอกสารรับวัตถุดิบ (หัวเอกสาร + รายการ)
- จำนวนตามใบส่งของ จำนวนรับจริง และจำนวนที่ปฏิเสธพร้อมเหตุผล
- เลข Lot วันผลิต วันหมดอายุ (ข้อมูลอ้างอิง ไม่ผูกกับการเบิก)
- ไฟล์แนบหลายไฟล์ต่อเอกสาร
- วงจรชีวิตเอกสาร `draft → posted → cancelled`
- การออกเลขที่เอกสารแบบกันเลขซ้ำ
- Master Data `master.reject_reasons`

### 2.2 อยู่นอกขอบเขต (ตัดสินใจแล้วว่าไม่ทำในเฟสนี้)

| รายการ | เหตุผล |
| --- | --- |
| ยอดคงเหลือ / Stock Ledger / การเบิกออก | ledger มีค่าเมื่อมีทั้งขาเข้าและขาออก ยอดที่เพิ่มทางเดียวจะไม่ตรงของจริงแล้วไม่มีใครเชื่อถือ |
| ต้นทุนสต็อก (Average / FIFO) | ต้องตัดสินใจเรื่องการปรับต้นทุนย้อนหลังและการผูกบัญชี เป็นงานอีกก้อน |
| Purchase Order | ใช้ `po_no` เป็นข้อความอ้างอิงก่อน เพิ่ม `po_id` เป็น nullable FK ทีหลังได้ |
| คลังหลายแห่ง / พื้นที่จัดเก็บ | มีที่เก็บที่เดียว |
| การสอบกลับราย Lot (ยอดคงเหลือแยก Lot) | เก็บ `lot_no` เป็นข้อความพอ |
| การชั่งน้ำหนัก (weighbridge) | ของที่รับนับเป็นชิ้น/ถุงได้ |
| การแปลงหน่วย | รับด้วยหน่วยเดียวกับ `Material.unitId` เสมอ |
| QC แยกขั้น (ของอยู่ในคลังแต่เบิกไม่ได้) | ตรวจหน้างานแล้วตัดสินใจในใบรับเลย |
| ข้อมูลรถและคนขับ | ไม่มีใครใช้ข้อมูลนี้ |
| การปิดงวด | ยังไม่มีระบบบัญชีที่ต้องปิดงวด |
| Audit log ระดับ field | ใช้ `posted_by`/`posted_at` และ `cancelled_by`/`cancelled_at` แทน |

การเพิ่มรายการเหล่านี้ในอนาคตต้องไม่ย้ายข้อมูลเข้ามาเก็บใน `goods_receipts` หรือ `goods_receipt_items`

## 3. Schema และรายการตาราง

ใช้ PostgreSQL schema ใหม่ชื่อ `inventory` (แยกจาก `iam` และ `master`) เพราะเป็นเอกสารธุรกรรม ไม่ใช่ข้อมูลหลัก

```text
inventory
├── goods_receipts              หัวเอกสาร
├── goods_receipt_items         รายการรับ
├── goods_receipt_attachments   ไฟล์แนบ
└── document_counters           ตัวรันเลขเอกสาร (ใช้ซ้ำกับเอกสารประเภทอื่นได้)

master
└── reject_reasons              เหตุผลการปฏิเสธของ
```

`reject_reasons` อยู่ `master` เพราะเป็น Master Data ที่ผู้ใช้ CRUD ได้ โครงสร้างเหมือน `master.loading_points`
`document_counters` อยู่ `inventory` เพราะเป็นสถานะภายในของระบบออกเลข ไม่มีหน้าจอ CRUD

## 4. ความสัมพันธ์

```text
master.organizations      1 ─── N inventory.goods_receipts
master.suppliers          1 ─── N inventory.goods_receipts
inventory.goods_receipts  1 ─── N inventory.goods_receipt_items
inventory.goods_receipts  1 ─── N inventory.goods_receipt_attachments
master.materials          1 ─── N inventory.goods_receipt_items
master.units              1 ─── N inventory.goods_receipt_items
master.reject_reasons     1 ─── N inventory.goods_receipt_items
```

- หนึ่งใบรับผูกกับ Supplier รายเดียว — สะท้อนเหตุการณ์จริงหนึ่งครั้ง (ใบส่งของหนึ่งใบ)
- ทุก FK ใช้ `ON DELETE RESTRICT` ตาม pattern ของ Material Master
- ใบรับเป็น FK แรกในระบบที่อ้าง `master.organizations`

## 5. ตาราง `inventory.goods_receipts`

| Column | Type | Required | รายละเอียด |
| --- | --- | ---: | --- |
| `id` | `BIGINT GENERATED ALWAYS AS IDENTITY` | ใช่ | Primary Key |
| `receipt_no` | `VARCHAR(30)` | ไม่ | รูปแบบ `GR-YYYYMM-NNNN` ออกตอน post จึงเป็น `NULL` ตอน draft |
| `organization_id` | `BIGINT` | ใช่ | FK `master.organizations.id` มาจาก config ไม่ใช่จากฟอร์ม |
| `supplier_id` | `BIGINT` | ใช่ | FK `master.suppliers.id` |
| `receipt_date` | `DATE` | ใช่ | วันที่ของมาถึง ห้ามเป็นวันในอนาคต กรอกย้อนหลังได้ |
| `po_no` | `VARCHAR(50)` | ไม่ | เลข PO เป็นข้อความ ไม่มี FK |
| `supplier_doc_no` | `VARCHAR(50)` | ไม่ | เลขที่ใบส่งของของ Supplier — required ตอน post เว้นแต่ `no_supplier_document = true` |
| `supplier_doc_date` | `DATE` | ไม่ | วันที่บนใบส่งของ |
| `no_supplier_document` | `BOOLEAN` | ใช่ | default `false` ระบุว่าของมาถึงโดยไม่มีเอกสารกำกับ |
| `status` | `VARCHAR(20)` | ใช่ | `draft` / `posted` / `cancelled` default `draft` |
| `remark` | `TEXT` | ไม่ | แก้ได้แม้เอกสารเป็น `posted` |
| `posted_by` | `BIGINT` | ไม่ | ผู้รับรองเอกสาร |
| `posted_at` | `TIMESTAMP` | ไม่ | เวลาที่รับรอง |
| `cancelled_by` | `BIGINT` | ไม่ | ผู้ยกเลิก |
| `cancelled_at` | `TIMESTAMP` | ไม่ | เวลาที่ยกเลิก |
| `cancel_reason` | `TEXT` | ไม่ | required เมื่อยกเลิก (ข้อความอิสระ) |
| `created_by` | `BIGINT` | ไม่ | |
| `updated_by` | `BIGINT` | ไม่ | |
| `created_at` | `TIMESTAMP` | ใช่ | เวลาที่กรอกเข้าระบบ ต่างจาก `receipt_date` |
| `updated_at` | `TIMESTAMP` | ใช่ | ใช้ทำ optimistic concurrency ตอนแก้ draft |

Constraints:

- `UNIQUE (organization_id, receipt_no) WHERE receipt_no IS NOT NULL` — เลขรันแยกต่อองค์กร
- `UNIQUE (supplier_id, supplier_doc_no) WHERE no_supplier_document = false AND status <> 'cancelled'` — กันการกรอกใบส่งของเดิมซ้ำ และปล่อยให้ออกใบใหม่ด้วยเลขเดิมได้หลังยกเลิก
- `CHECK (receipt_date <= CURRENT_DATE)` ตรวจที่ระดับ DTO ด้วย
- `CHECK (status IN ('draft', 'posted', 'cancelled'))`

## 6. ตาราง `inventory.goods_receipt_items`

| Column | Type | Required | รายละเอียด |
| --- | --- | ---: | --- |
| `id` | `BIGINT GENERATED ALWAYS AS IDENTITY` | ใช่ | Primary Key |
| `goods_receipt_id` | `BIGINT` | ใช่ | FK `inventory.goods_receipts.id` `ON DELETE CASCADE` |
| `line_no` | `INTEGER` | ใช่ | ลำดับบรรทัดในเอกสาร |
| `material_id` | `BIGINT` | ใช่ | FK `master.materials.id` ใช้ join ตอนทำรายงาน |
| `material_code` | `VARCHAR(50)` | ไม่ | Snapshot ตอน post |
| `material_name` | `VARCHAR(255)` | ไม่ | Snapshot ตอน post |
| `unit_id` | `BIGINT` | ใช่ | FK `master.units.id` — หน่วยหลักของ Material ณ ตอนสร้าง |
| `qty_delivered` | `NUMERIC(18,4)` | ใช่ | จำนวนตามใบส่งของ |
| `qty_received` | `NUMERIC(18,4)` | ใช่ | รับเข้าจริง |
| `qty_rejected` | `NUMERIC(18,4)` | ใช่ | ปฏิเสธ ไม่เข้าสต็อก default `0` |
| `reject_reason_id` | `BIGINT` | ไม่ | FK `master.reject_reasons.id` required เมื่อ `qty_rejected > 0` |
| `reject_note` | `TEXT` | ไม่ | หมายเหตุเพิ่มเติมของการปฏิเสธ |
| `lot_no` | `VARCHAR(50)` | ไม่ | ข้อมูลอ้างอิง ไม่ผูกกับการเบิก |
| `production_date` | `DATE` | ไม่ | ข้อมูลอ้างอิง |
| `expiry_date` | `DATE` | ไม่ | ข้อมูลอ้างอิง |
| `unit_price` | `NUMERIC(18,4)` | ไม่ | เก็บไว้อ้างอิง ระบบยังไม่คำนวณต้นทุน |
| `line_amount` | `NUMERIC(18,4)` | ไม่ | เก็บไว้อ้างอิง |
| `remark` | `TEXT` | ไม่ | |
| `created_by` `updated_by` `created_at` `updated_at` | | | ตาม pattern เดิม |

Constraints:

- `UNIQUE (goods_receipt_id, line_no)`
- `UNIQUE (goods_receipt_id, material_id, lot_no)` — วัตถุดิบซ้ำได้ถ้าต่าง Lot แต่ห้ามซ้ำทั้งคู่
- `CHECK (qty_delivered >= 0 AND qty_received >= 0 AND qty_rejected >= 0)`
- `CHECK (qty_received + qty_rejected <= qty_delivered)`
- `CHECK (qty_received > 0 OR qty_rejected > 0)` — ห้ามบรรทัดที่เป็นศูนย์ทั้งคู่

> `NUMERIC` ทุกคอลัมน์รับและส่งเป็น `string` ฝั่ง TypeScript แบบเดียวกับ `bigint` เพราะ `pg` driver คืน `numeric` เป็น string ห้ามใช้ `float` หรือ `double precision`

## 7. ตาราง `inventory.goods_receipt_attachments`

| Column | Type | Required | รายละเอียด |
| --- | --- | ---: | --- |
| `id` | `BIGINT GENERATED ALWAYS AS IDENTITY` | ใช่ | |
| `goods_receipt_id` | `BIGINT` | ใช่ | FK `ON DELETE CASCADE` |
| `doc_type` | `VARCHAR(30)` | ใช่ | `DELIVERY_NOTE` / `TAX_INVOICE` / `PHOTO` / `OTHER` |
| `file_path` | `VARCHAR(500)` | ใช่ | Path ในดิสก์ ไม่เก็บ Binary ใน PostgreSQL |
| `file_name` | `VARCHAR(255)` | ใช่ | ชื่อไฟล์ต้นฉบับที่ผู้ใช้อัปโหลด |
| `mime_type` | `VARCHAR(100)` | ใช่ | |
| `file_size` | `INTEGER` | ใช่ | Byte |
| `created_by` `created_at` | | | ไม่มี `updated_*` เพราะไฟล์แนบไม่ถูกแก้ |

กฎ:

- อนุญาต JPEG, PNG, WEBP, PDF โดย validate magic bytes ทั้ง 4 ชนิด (`%PDF-` สำหรับ PDF)
- ขนาดไม่เกิน 10 MiB ต่อไฟล์ และไม่เกิน 10 ไฟล์ต่อเอกสาร
- เก็บที่ `uploads/goods-receipts/` แยกจาก `uploads/materials/`
- แนบเพิ่มได้ตลอดแม้เอกสารเป็น `posted` เพราะใบกำกับภาษีมักมาถึงหลังของ
- ลบไฟล์แนบได้เฉพาะเมื่อเอกสารเป็น `draft` — การลบหลักฐานออกจากเอกสารที่รับรองแล้วคือการแก้เอกสาร
- ใช้ pattern `stage` → `promote` → `discard` แบบเดียวกับ `MaterialImageStorageService` เพื่อ compensate ไฟล์เมื่อ transaction fail
- **ห้ามแก้ `MaterialImageStorageService` ให้รับ PDF** ต้องสร้าง service ของโมดูลนี้แยก

## 8. ตาราง `inventory.document_counters`

| Column | Type | Required | รายละเอียด |
| --- | --- | ---: | --- |
| `id` | `BIGINT GENERATED ALWAYS AS IDENTITY` | ใช่ | |
| `organization_id` | `BIGINT` | ใช่ | เลขรันแยกต่อองค์กร |
| `doc_type` | `VARCHAR(30)` | ใช่ | `GOODS_RECEIPT` |
| `period` | `VARCHAR(6)` | ใช่ | `YYYYMM` |
| `last_number` | `INTEGER` | ใช่ | default `0` |
| `created_at` `updated_at` | | | |

`UNIQUE (organization_id, doc_type, period)`

เหตุผลที่ไม่ใช้ PostgreSQL sequence: sequence ไม่ rollback ตาม transaction ทำให้เกิดช่องว่างถาวรในลำดับเลขเมื่อ transaction fail และรีเซ็ตรายเดือนอัตโนมัติไม่ได้
เหตุผลที่ไม่ใช้ `MAX(receipt_no) + 1`: สองคน post พร้อมกันจะได้เลขเดียวกัน

## 9. ตาราง `master.reject_reasons`

โครงสร้างเหมือน `master.loading_points` ทุกคอลัมน์

```text
id
code          -- unique
name_th
name_en
description
is_active
created_by
updated_by
created_at
updated_at
```

บังคับ `is_active = true` เฉพาะตอนสร้างหรือแก้เอกสาร — เอกสารเก่าที่อ้างเหตุผลที่ถูกปิดไปแล้วต้องอ่านได้ปกติ (พฤติกรรมเดียวกับ `assertActiveReference` ใน `materials.service.ts`)

## 10. วงจรชีวิตเอกสาร

```text
                ┌──────────── delete (hard delete) ────────────┐
                │                                              ▼
  create ──> draft ──── post ────> posted ──── cancel ────> cancelled
```

| สถานะ | แก้ได้ | ลบได้ | เลขเอกสาร | หมายเหตุ |
| --- | --- | --- | --- | --- |
| `draft` | ทุกฟิลด์ | ได้ (hard delete) | ยังไม่มี | ยังไม่ใช่เอกสารจริง |
| `posted` | เฉพาะ `remark` และการเพิ่มไฟล์แนบ | ไม่ได้ | มี | เป็นหลักฐานที่ต้องนิ่ง |
| `cancelled` | ไม่ได้ | ไม่ได้ | คงเลขเดิม | ยังปรากฏในรายการ ไม่ซ่อน |

เหตุผลที่ `posted` ต้องล็อกแม้ยังไม่มีสต็อก: ใบรับเป็นหลักฐานที่ใช้คุยกับ Supplier และเมื่อโมดูลเบิกมาถึงในอนาคต `goods_receipt_items` จะถูกใช้ generate stock movement ย้อนหลัง ถ้าตัวเลขเคยถูกแก้อย่างอิสระ ยอดที่ได้ก็เชื่อไม่ได้

การแก้เอกสารที่ `posted` ทำด้วยการยกเลิกแล้วออกใบใหม่ ไม่ใช่แก้ที่เดิม

### 10.1 ขั้นตอนตอน `post`

ทั้งหมดอยู่ใน `DataSource.transaction()` เดียว

1. ล็อกเอกสารด้วย `pessimistic_write` และตรวจว่าสถานะเป็น `draft`
2. ตรวจกฎธุรกรรมทั้งหมดในหมวด 11
3. Snapshot `material_code` และ `material_name` ลงทุกบรรทัด
4. ออกเลขเอกสารจาก `document_counters` โดยล็อกแถวด้วย `pessimistic_write` — **ทำเป็นขั้นตอนสุดท้าย** เพื่อให้ล็อกสั้นที่สุด
5. บันทึก `status = 'posted'`, `posted_by`, `posted_at`

## 11. กฎธุรกิจ

| # | กฎ | ตรวจเมื่อ |
| --- | --- | --- |
| 1 | ต้องมีอย่างน้อย 1 บรรทัด | post |
| 2 | `qty_received > 0 OR qty_rejected > 0` ทุกบรรทัด | create / update / post |
| 3 | `qty_received + qty_rejected <= qty_delivered` | create / update / post |
| 4 | `reject_reason_id` required เมื่อ `qty_rejected > 0` | create / update / post |
| 5 | ห้าม `(material_id, lot_no)` ซ้ำกันในเอกสารเดียว | create / update |
| 6 | ทุกบรรทัดต้องมี mapping ที่ active ใน `master.supplier_materials` กับ Supplier ที่หัวเอกสาร มิฉะนั้น `400` | create / update / post |
| 7 | `supplier_doc_no` required เว้นแต่ `no_supplier_document = true` | post |
| 8 | `receipt_date` ห้ามเป็นวันในอนาคต | create / update |
| 9 | FK ทุกตัวต้องชี้ไปแถวที่ `is_active = true` | create / update |
| 10 | `cancel_reason` required | cancel |
| 11 | Optimistic concurrency ผ่าน `updatedAt` ตอบ `409` ถ้าไม่ตรง | update draft |

## 12. สิทธิ์และเมนู

### 12.1 Permission

| Code | ใช้กับ |
| --- | --- |
| `GOODS_RECEIPT_VIEW` | ดูรายการและรายละเอียด |
| `GOODS_RECEIPT_CREATE` | สร้าง draft และ stage ไฟล์แนบ |
| `GOODS_RECEIPT_UPDATE` | แก้ draft |
| `GOODS_RECEIPT_DELETE` | ลบ draft |
| `GOODS_RECEIPT_POST` | รับรองเอกสาร (`draft → posted`) |
| `GOODS_RECEIPT_CANCEL` | ยกเลิกเอกสารที่รับรองแล้ว |

`POST` และ `CANCEL` แยกจาก `UPDATE`/`DELETE` เพราะเป็นการกระทำที่เปลี่ยนสถานะเอกสารอย่างถาวร และต้องบังคับให้คนละกลุ่มคนทำได้ในอนาคตโดยไม่ต้องแก้โค้ด

เฟสนี้ **ไม่บังคับ** ว่า `posted_by` ต้องต่างจาก `created_by`

### 12.2 สิ่งที่ต้องเพิ่มในระบบสิทธิ์

- `iam.actions` เพิ่ม 2 แถว: `POST`, `CANCEL` (`is_system = true`)
- `src/common/enums/action-code.enum.ts` เพิ่ม 2 ค่าให้ตรงกับฐานข้อมูล
- `seed.ts` refactor การสร้าง permission จาก ternary ซ้อนกันเป็น registry แบบ `Record<menuCode, Record<actionCode, permissionCode>>` เพื่อรองรับเมนูที่มี action ไม่เท่ากัน — ต้องมี test ยืนยันว่า permission code ของทุกโมดูลเดิมไม่เปลี่ยน

### 12.3 เมนู

| Code | Path | Icon | Sort |
| --- | --- | --- | --- |
| `GOODS_RECEIPT` | `/goods-receipts` | `inbox` | 85 |
| `REJECT_REASON_MANAGEMENT` | `/master-data/reject-reasons` | `x-circle` | 95 |

## 13. REST Endpoints

| Method | Path | Permission | คำอธิบาย |
| --- | --- | --- | --- |
| GET | `/goods-receipts` | `GOODS_RECEIPT_VIEW` | รายการ พร้อม filter/sort/pagination |
| GET | `/goods-receipts/lookups` | `GOODS_RECEIPT_VIEW` | Supplier, Material (กรองตาม Supplier), Unit, Reject Reason |
| GET | `/goods-receipts/:id` | `GOODS_RECEIPT_VIEW` | หัวเอกสาร + บรรทัด + ไฟล์แนบ |
| POST | `/goods-receipts` | `GOODS_RECEIPT_CREATE` | สร้าง draft |
| PATCH | `/goods-receipts/:id` | `GOODS_RECEIPT_UPDATE` | แก้ draft (ต้องส่ง `updatedAt`) |
| DELETE | `/goods-receipts/:id` | `GOODS_RECEIPT_DELETE` | ลบ draft (hard delete) |
| POST | `/goods-receipts/:id/post` | `GOODS_RECEIPT_POST` | รับรองเอกสาร |
| POST | `/goods-receipts/:id/cancel` | `GOODS_RECEIPT_CANCEL` | ยกเลิก (ต้องมีเหตุผล) |
| POST | `/goods-receipts/attachments` | `GOODS_RECEIPT_CREATE` หรือ `UPDATE` | Stage ไฟล์แนบ (multipart) |
| POST | `/goods-receipts/:id/attachments` | `GOODS_RECEIPT_CREATE` หรือ `UPDATE` | ผูกไฟล์ที่ stage แล้วเข้าเอกสาร (ทำได้แม้ posted) |
| DELETE | `/goods-receipts/:id/attachments/:attachmentId` | `GOODS_RECEIPT_UPDATE` | ลบไฟล์แนบ (เฉพาะ draft) |

### 13.1 รายการ (`GET /goods-receipts`)

**ค้นหา** `search` ค้นใน `receipt_no` และ `supplier_doc_no` เท่านั้น (ไม่ค้นชื่อวัตถุดิบเพราะต้อง join บรรทัด)

**กรอง** `status`, `supplierId`, `materialId` (EXISTS subquery กับ `goods_receipt_items`), `receiptDateFrom`, `receiptDateTo`, `hasRejection`

**เรียง** `receiptNo`, `receiptDate`, `supplierDocNo`, `createdAt`, `updatedAt` — default `receiptDate DESC` แล้ว `id DESC`

**ค่าเริ่มต้นของ `status`** ไม่กรอง แสดงทุกสถานะรวม `cancelled` เพราะเอกสารที่ยกเลิกต้องไม่หายไปจากสายตา

**Payload ของแต่ละรายการ** หัวเอกสาร + ชื่อ Supplier + `itemCount` + ผลรวม `qty_received` ไม่ส่งบรรทัดทั้งหมด

## 14. แนวปฏิบัติที่ต้องตาม

ยึดตาม pattern ที่ `src/modules/materials/` ใช้อยู่

- ครอบทุก write ด้วย `DataSource.transaction()` และ `findOne` ด้วย `lock: { mode: 'pessimistic_write' }` ก่อนแก้
- Validate FK ด้วยการล็อก `pessimistic_read` และปฏิเสธแถวที่ `is_active = false`
- FK id ทุกตัวเป็น `string` + validate ด้วย `/^[1-9]\d*$/` (`POSITIVE_DECIMAL_ID`) และเพิ่ม validator ใหม่สำหรับ `NUMERIC` ที่มีทศนิยม
- Response ประกอบด้วยการ whitelist field ทีละตัว ไม่ return entity ดิบ
- Unique violation `23505` แปลงเป็น `409` พร้อมข้อความเฉพาะเจาะจง
- ชื่อคอลัมน์ใน DB เป็น `snake_case` และ TypeORM property เป็น `camelCase`
- อ่าน environment variable ผ่าน `getEnv` จาก `src/config/env.utils.ts` เท่านั้น

## 15. Config ที่ต้องเพิ่ม

| Key | ความหมาย |
| --- | --- |
| `DEFAULT_ORGANIZATION_CODE` | รหัสองค์กรที่ใช้กับเอกสารทุกใบ ค่าเริ่มต้น `CPS`; seed จะสร้างองค์กร active แบบ `headquarters` ด้วย code นี้ใน fresh database และแอปจะ fail ตอน startup หากองค์กรถูกลบหรือปิดใช้งาน |

เหตุผล: ไม่มี entity ใดในระบบผูกกับ `organization_id` และ `User`/`Department` ไม่มีสังกัดองค์กร จึงหาไม่ได้ว่าผู้ใช้อยู่บริษัทไหน การเพิ่ม `organization_id` ให้ `iam.departments` เป็นงานแยกที่กระทบการคำนวณสิทธิ์ทั้งระบบ

## 16. Implementation Status

| Layer | ไฟล์ |
| --- | --- |
| Migration | `src/database/migrations/1700000000008-CreateGoodsReceipt.ts`, `1700000000009-AddPostCancelActions.ts` |
| Entities | `src/entities/inventory/{goods-receipt,goods-receipt-item,goods-receipt-attachment,document-counter}.entity.ts`, `src/entities/master/reject-reason.entity.ts` |
| Module | `src/modules/goods-receipts/goods-receipts.module.ts`, `src/modules/reject-reasons/reject-reasons.module.ts` |
| Service | `src/modules/goods-receipts/goods-receipts.service.ts` (create, update, remove, post, cancel, addAttachments, removeAttachment, findAll, findOne, getLookups) |
| Controller | `src/modules/goods-receipts/goods-receipts.controller.ts` |
| Attachment storage | `src/modules/goods-receipts/goods-receipt-attachment-storage.service.ts` (stage → promote → discard → describe) |
| DTOs | `src/modules/goods-receipts/dto/*.ts` พร้อม `transforms.ts` ที่รวม helper และ regex |
| Permissions | `src/modules/goods-receipts/goods-receipt-permissions.ts`, `src/modules/reject-reasons/reject-reason-permissions.ts` |
| Seed | `src/database/seeds/permission-registry.ts` + เมนู/action ใน `seed.ts` |
| Tests | `*.spec.ts` ของทุก layer ด้านบน รวม 9 ไฟล์ / 142 tests |

## 17. เอกสารที่เกี่ยวข้อง

- [Material Master Requirements](material-master.md) — ข้อมูลหลักที่โมดูลนี้อ้างอิง
- [PROJECT-WIKI.md](../../PROJECT-WIKI.md) — architecture, conventions, forbidden patterns
- [API_ENDPOINTS.md](../../API_ENDPOINTS.md) — REST contract พร้อมตัวอย่าง request/response
