# Requirements Document

## Introduction

เอกสารนี้ระบุ requirement สำหรับสร้างหน้าจอ (UI) ของโมดูล Goods Receipt ในระบบ cps-api โดย Backend REST API ของโมดูลนี้ (`/goods-receipts/*`) พัฒนาเสร็จสมบูรณ์แล้ว requirement ทั้งหมดในเอกสารนี้อ้างอิงจาก endpoint, query parameter, request/response field และกฎธุรกิจที่มีอยู่จริงใน API เท่านั้น **ห้ามระบุ endpoint, field หรือพฤติกรรมที่ Backend ไม่มี**

ขอบเขตของ UI ครอบคลุม: รายการเอกสาร (พร้อม filter/sort/pagination), สร้างเอกสารใหม่, ดู/แก้ไขเอกสาร, เปลี่ยนสถานะเอกสาร (post/cancel), จัดการไฟล์แนบ, การใช้ lookup data ประกอบฟอร์ม, การซ่อน/แสดง action ตามสิทธิ์ผู้ใช้ และการแสดงข้อผิดพลาดจาก API

**นอกขอบเขต**: ระบบ authentication/login (สมมติว่ามี access token ที่ใช้งานได้อยู่แล้ว), การจัดการ master data อื่น (units, suppliers, reject reasons CRUD เป็นคนละ feature)

## Glossary

- **Goods_Receipt_UI**: ระบบส่วนหน้า (frontend application) ของโมดูล Goods Receipt ที่ระบุใน requirement นี้ทั้งหมด
- **Goods_Receipt_API**: REST API ฝั่ง backend ของโมดูล Goods Receipt ที่มีอยู่แล้วที่ path `/goods-receipts/*` ซึ่งเป็น contract ที่ตายตัว Goods_Receipt_UI เรียกใช้งานตามที่มีอยู่จริงเท่านั้น
- **List_Screen**: หน้าจอแสดงรายการเอกสารรับวัตถุดิบของ Goods_Receipt_UI
- **Form_Screen**: หน้าจอสร้างเอกสารใหม่หรือแก้ไขเอกสารที่มีอยู่ของ Goods_Receipt_UI (ใช้โครงฟอร์มเดียวกันสำหรับ create และ edit)
- **Detail_Screen**: หน้าจอแสดงรายละเอียดเอกสารแบบอ่านอย่างเดียวของ Goods_Receipt_UI สำหรับเอกสารที่ไม่ใช่ draft
- **Goods_Receipt**: เอกสารรับวัตถุดิบหนึ่งใบ ประกอบด้วยหัวเอกสารและ Line_Item หนึ่งรายการขึ้นไป
- **Line_Item**: แถวรายการวัตถุดิบหนึ่งบรรทัดภายใน Goods_Receipt
- **Attachment**: ไฟล์แนบหนึ่งไฟล์ที่ผูกกับ Goods_Receipt
- **Lookup_Data**: ข้อมูลอ้างอิงชุด suppliers, materials, units, rejectReasons ที่ได้จาก `GET /goods-receipts/lookups`
- **Current_User**: ผู้ใช้ที่ผ่านการยืนยันตัวตนและมี access token ที่ใช้งานอยู่ ณ ขณะใช้ Goods_Receipt_UI
- **Permission_Set**: ชุดสิทธิ์ที่ผูกกับ Current_User ได้แก่ `GOODS_RECEIPT_VIEW`, `GOODS_RECEIPT_CREATE`, `GOODS_RECEIPT_UPDATE`, `GOODS_RECEIPT_DELETE`, `GOODS_RECEIPT_POST`, `GOODS_RECEIPT_CANCEL`
- **Draft_Status**: สถานะ `draft` ของ Goods_Receipt — แก้ไขได้ทุก field และลบได้
- **Posted_Status**: สถานะ `posted` ของ Goods_Receipt — แก้ไขได้เฉพาะ `remark` และการเพิ่ม Attachment
- **Cancelled_Status**: สถานะ `cancelled` ของ Goods_Receipt — แก้ไขและลบไม่ได้ แต่ยังปรากฏในรายการ
- **Decimal_Field**: field ตัวเลขที่ Goods_Receipt_API รับ/ส่งเป็น string ทศนิยมไม่เกิน 4 ตำแหน่ง ได้แก่ `qtyDelivered`, `qtyReceived`, `qtyRejected`, `unitPrice`, `lineAmount`

## Requirements

### Requirement 1: หน้ารายการเอกสารรับวัตถุดิบ

**User Story:** As a ผู้ใช้งานที่มีสิทธิ์ดูเอกสารรับวัตถุดิบ, I want เห็นรายการเอกสารพร้อมค้นหาและกรองข้อมูลได้, so that ฉันสามารถหาเอกสารที่ต้องการได้อย่างรวดเร็ว

#### Acceptance Criteria

1. WHEN Current_User เปิด List_Screen, THE Goods_Receipt_UI SHALL เรียก `GET /goods-receipts` ด้วยค่าพารามิเตอร์ `page=1` และ `limit=20` เป็นค่าเริ่มต้น
2. THE List_Screen SHALL แสดงคอลัมน์ `receiptNo`, `receiptDate`, `supplier.nameTh`, `supplierDocNo`, `status`, `itemCount`, `totalQtyReceived` จากผลลัพธ์ `items[]` ของ `GET /goods-receipts`
3. WHEN Current_User กรอกคำค้นหา, THE List_Screen SHALL ส่งค่านั้นเป็นพารามิเตอร์ `search` ไปยัง `GET /goods-receipts`
4. WHERE Current_User เลือกตัวกรองสถานะ, THE List_Screen SHALL ส่งพารามิเตอร์ `status` ด้วยค่าใดค่าหนึ่งจาก `draft`, `posted`, `cancelled`
5. WHERE Current_User เลือกตัวกรอง Supplier, THE List_Screen SHALL ส่งพารามิเตอร์ `supplierId` ด้วยรายการ Supplier จาก Lookup_Data
6. WHERE Current_User เลือกตัวกรอง Material, THE List_Screen SHALL ส่งพารามิเตอร์ `materialId` ด้วยรายการ Material จาก Lookup_Data
7. WHERE Current_User เลือกช่วงวันที่รับของ, THE List_Screen SHALL ส่งพารามิเตอร์ `receiptDateFrom` และ `receiptDateTo` ในรูปแบบ `YYYY-MM-DD`
8. WHERE Current_User เลือกตัวกรอง "มีบรรทัดที่ถูกปฏิเสธ", THE List_Screen SHALL ส่งพารามิเตอร์ `hasRejection` ด้วยค่า `true` หรือ `false`
9. WHEN Current_User เลือกคอลัมน์สำหรับเรียงลำดับ, THE List_Screen SHALL ส่งพารามิเตอร์ `sortBy` ด้วยค่าใดค่าหนึ่งจาก `receiptNo`, `receiptDate`, `supplierDocNo`, `createdAt`, `updatedAt` พร้อมพารามิเตอร์ `sortOrder` ด้วยค่า `asc` หรือ `desc`
10. WHEN Current_User เปลี่ยนหน้าหรือจำนวนรายการต่อหน้า, THE List_Screen SHALL ส่งพารามิเตอร์ `page` และ `limit` ที่สอดคล้องกัน โดย `limit` ต้องอยู่ในช่วง 1 ถึง 100
11. THE List_Screen SHALL แสดงจำนวนหน้าทั้งหมดและจำนวนรายการทั้งหมดจาก field `meta.totalPages` และ `meta.totalItems` ของผลลัพธ์
12. WHEN Current_User กดเปิดเอกสารรายการหนึ่งจาก List_Screen, THE Goods_Receipt_UI SHALL นำทางไปยัง Detail_Screen หรือ Form_Screen ตาม `status` ของเอกสารนั้น

### Requirement 2: การใช้ Lookup Data ประกอบฟอร์ม

**User Story:** As a ผู้ใช้งานที่กำลังสร้างหรือแก้ไขเอกสาร, I want เลือก Supplier, Material, Unit และ Reject Reason จากรายการที่ระบบเตรียมไว้, so that ข้อมูลที่กรอกถูกต้องตรงกับ master data จริง

#### Acceptance Criteria

1. WHEN Form_Screen ถูกเปิด, THE Goods_Receipt_UI SHALL เรียก `GET /goods-receipts/lookups` เพื่อดึงรายการ `suppliers`, `materials`, `units`, `rejectReasons`
2. THE Form_Screen SHALL แสดงตัวเลือก Supplier จาก field `suppliers[]` ของผลลัพธ์ Lookup_Data โดยใช้ `id` เป็นค่าและ `nameTh` เป็นข้อความแสดง
3. WHEN Current_User เลือกหรือเปลี่ยน Supplier บน Form_Screen, THE Goods_Receipt_UI SHALL เรียก `GET /goods-receipts/lookups` พร้อมพารามิเตอร์ `supplierId` เพื่อดึงรายการ Material ที่กรองตาม Supplier ที่เลือก
4. THE Line_Item_Row SHALL แสดงตัวเลือก Material เฉพาะรายการที่ได้จาก field `materials[]` ของผลลัพธ์ Lookup_Data ล่าสุด
5. IF Current_User ยังไม่เลือก Supplier บน Form_Screen หรือคำขอ `GET /goods-receipts/lookups` ที่กรองตาม Supplier ที่เลือกยังไม่เสร็จสมบูรณ์, THEN THE Goods_Receipt_UI SHALL ปิดการใช้งานตัวเลือก Material บน Line_Item_Row ทุกแถว
6. THE Line_Item_Row SHALL แสดงตัวเลือก Reject Reason จาก field `rejectReasons[]` ของผลลัพธ์ Lookup_Data

### Requirement 3: การสร้างเอกสารรับวัตถุดิบใหม่ — หัวเอกสาร

**User Story:** As a ผู้ใช้งานที่มีสิทธิ์สร้างเอกสาร, I want กรอกข้อมูลหัวเอกสารรับวัตถุดิบ, so that ฉันสามารถบันทึกเอกสารเป็นสถานะ draft ได้

#### Acceptance Criteria

1. THE Form_Screen SHALL ให้ Current_User กรอก `supplierId`, `receiptDate`, `poNo`, `supplierDocNo`, `supplierDocDate`, `noSupplierDocument`, `remark` สำหรับสร้างเอกสารใหม่
2. THE Form_Screen SHALL กำหนดให้ `supplierId` และ `receiptDate` เป็นข้อมูลบังคับก่อนบันทึกเอกสาร
3. IF Current_User เลือกวันที่ใน `receiptDate` ที่มากกว่าวันปัจจุบัน, THEN THE Form_Screen SHALL แสดงข้อความแจ้งเตือนและป้องกันการส่งข้อมูลไปยัง Goods_Receipt_API
4. WHERE Current_User เปิดสวิตช์ `noSupplierDocument`, THE Form_Screen SHALL อนุญาตให้เว้นค่าง `supplierDocNo` ว่างได้
5. WHEN Current_User กดบันทึกเอกสารใหม่และผ่านการตรวจสอบข้อมูลฝั่ง UI, THE Goods_Receipt_UI SHALL เรียก `POST /goods-receipts` ด้วยค่าหัวเอกสารและรายการ `items[]` ที่กรอกไว้

### Requirement 4: การสร้างเอกสารรับวัตถุดิบใหม่ — รายการวัตถุดิบแบบ dynamic rows

**User Story:** As a ผู้ใช้งานที่มีสิทธิ์สร้างเอกสาร, I want เพิ่มหรือลบบรรทัดวัตถุดิบได้หลายบรรทัดในฟอร์มเดียว, so that ฉันสามารถบันทึกวัตถุดิบทั้งหมดที่รับมาในเอกสารเดียว

#### Acceptance Criteria

1. WHEN Current_User กดปุ่มเพิ่มบรรทัด, THE Form_Screen SHALL เพิ่ม Line_Item_Row ใหม่ที่มี field `materialId`, `qtyDelivered`, `qtyReceived`, `qtyRejected`, `rejectReasonId`, `rejectNote`, `lotNo`, `productionDate`, `expiryDate`, `unitPrice`, `lineAmount`, `remark`
2. WHEN Current_User กดปุ่มลบบรรทัดบน Line_Item_Row, THE Form_Screen SHALL เอาบรรทัดนั้นออกจากรายการที่จะส่งไปยัง Goods_Receipt_API
3. THE Form_Screen SHALL กำหนดให้เอกสารมี Line_Item อย่างน้อยหนึ่งบรรทัดก่อนบันทึกเอกสารใหม่
4. IF ผลรวมของ `qtyReceived` และ `qtyRejected` ใน Line_Item_Row มากกว่าค่า `qtyDelivered` ของบรรทัดเดียวกัน, THEN THE Form_Screen SHALL แสดงข้อความแจ้งเตือนบนบรรทัดนั้นและป้องกันการบันทึกเอกสาร
5. IF ทั้ง `qtyReceived` และ `qtyRejected` ของ Line_Item_Row เท่ากับ 0, THEN THE Form_Screen SHALL แสดงข้อความแจ้งเตือนบนบรรทัดนั้นและป้องกันการบันทึกเอกสาร
6. IF `qtyRejected` ของ Line_Item_Row มากกว่า 0 และ `rejectReasonId` ของบรรทัดเดียวกันว่าง, THEN THE Form_Screen SHALL แสดงข้อความแจ้งเตือนบนบรรทัดนั้นและป้องกันการบันทึกเอกสาร
7. IF `qtyRejected` ของ Line_Item_Row เท่ากับ 0 และ `rejectReasonId` ของบรรทัดเดียวกันมีค่า, THEN THE Form_Screen SHALL แสดงข้อความแจ้งเตือนบนบรรทัดนั้นและป้องกันการบันทึกเอกสาร
8. IF ค่าคู่ `materialId` และ `lotNo` ของ Line_Item_Row หนึ่งซ้ำกับ Line_Item_Row อื่นในฟอร์มเดียวกัน, THEN THE Form_Screen SHALL แสดงข้อความแจ้งเตือนและป้องกันการบันทึกเอกสาร
9. THE Line_Item_Row SHALL รับค่า Decimal_Field เป็นข้อความตัวเลขทศนิยมไม่เกิน 4 ตำแหน่งเท่านั้น และ Goods_Receipt_UI SHALL ส่งค่า Decimal_Field เป็น string ไปยัง Goods_Receipt_API เสมอ

### Requirement 5: การดูรายละเอียดเอกสาร

**User Story:** As a ผู้ใช้งานที่มีสิทธิ์ดูเอกสารรับวัตถุดิบ, I want ดูรายละเอียดเอกสารทั้งหัวเอกสาร รายการวัตถุดิบ และไฟล์แนบ, so that ฉันสามารถตรวจสอบข้อมูลเอกสารได้ครบถ้วน

#### Acceptance Criteria

1. WHEN Current_User เปิดเอกสารจาก List_Screen, THE Goods_Receipt_UI SHALL เรียก `GET /goods-receipts/:id` เพื่อดึงข้อมูลหัวเอกสาร, `items[]`, และ `attachments[]`
2. THE Detail_Screen SHALL แสดงข้อมูลหัวเอกสารทุก field ที่ได้จาก `GET /goods-receipts/:id` ได้แก่ `receiptNo`, `supplier`, `receiptDate`, `poNo`, `supplierDocNo`, `supplierDocDate`, `noSupplierDocument`, `status`, `remark`, `postedBy`, `postedAt`, `cancelledBy`, `cancelledAt`, `cancelReason`
3. THE Detail_Screen SHALL แสดงรายการ Line_Item ทุกบรรทัดจาก field `items[]` พร้อม `material`, `unit`, `rejectReason` ที่ถูกส่งกลับมา
4. THE Detail_Screen SHALL แสดงรายการ Attachment ทุกไฟล์จาก field `attachments[]` พร้อม `docType`, `fileName`, `mimeType`, `fileSize`
5. IF Goods_Receipt_API ตอบกลับด้วยรหัสสถานะ 404 สำหรับ `GET /goods-receipts/:id`, THEN THE Goods_Receipt_UI SHALL แสดงข้อความว่าไม่พบเอกสารและนำทางกลับไปยัง List_Screen

### Requirement 6: การแก้ไขเอกสารสถานะ draft

**User Story:** As a ผู้ใช้งานที่มีสิทธิ์แก้ไขเอกสาร, I want แก้ไขข้อมูลของเอกสาร draft ได้ทุก field, so that ฉันสามารถปรับปรุงข้อมูลก่อนรับรองเอกสาร

#### Acceptance Criteria

1. WHILE Goods_Receipt ที่เปิดอยู่มี `status` เป็น Draft_Status, THE Form_Screen SHALL อนุญาตให้ Current_User แก้ไขหัวเอกสารทุก field และ Line_Item ทุกบรรทัด
2. WHEN Current_User กดบันทึกการแก้ไขเอกสาร draft, THE Goods_Receipt_UI SHALL เรียก `PATCH /goods-receipts/:id` พร้อมค่า `updatedAt` ที่ได้จากการดึงข้อมูลเอกสารครั้งล่าสุด
3. THE Form_Screen SHALL ใช้กฎการตรวจสอบข้อมูลของ Line_Item เดียวกันกับ Requirement 4 เมื่อ Current_User แก้ไขเอกสาร draft ก่อนส่งไปยัง Goods_Receipt_API
4. IF Goods_Receipt_API ตอบกลับด้วยรหัสสถานะ 409 พร้อมสาเหตุ `updatedAt` ไม่ตรงกัน, THEN THE Goods_Receipt_UI SHALL แสดงข้อความแจ้งว่าเอกสารถูกแก้ไขโดยผู้ใช้อื่นและเสนอให้โหลดข้อมูลล่าสุดใหม่
5. WHEN Current_User กดลบเอกสาร draft, THE Goods_Receipt_UI SHALL แสดงกล่องยืนยันก่อนเรียก `DELETE /goods-receipts/:id`

### Requirement 7: ข้อจำกัดการแก้ไขเอกสารสถานะ posted และ cancelled

**User Story:** As a ผู้ใช้งาน, I want ระบบป้องกันการแก้ไขข้อมูลของเอกสารที่รับรองแล้วหรือถูกยกเลิกแล้วนอกเหนือจากที่อนุญาต, so that ข้อมูลเอกสารที่เป็นหลักฐานยังคงความถูกต้องน่าเชื่อถือ

#### Acceptance Criteria

1. WHILE Goods_Receipt ที่เปิดอยู่มี `status` เป็น Posted_Status, THE Form_Screen SHALL คงเปิดการใช้งาน field `remark` และปุ่มเพิ่ม Attachment ให้ Current_User แก้ไขได้โดยไม่ขึ้นกับสถานะอ่านอย่างเดียวของ field อื่นบนฟอร์ม
2. WHILE Goods_Receipt ที่เปิดอยู่มี `status` เป็น Posted_Status, THE Form_Screen SHALL ปิดการใช้งาน field หัวเอกสารอื่นทั้งหมดนอกเหนือจาก `remark` และทุก field ของ Line_Item
3. WHILE Goods_Receipt ที่เปิดอยู่มี `status` เป็น Cancelled_Status, THE Detail_Screen SHALL แสดงข้อมูลเอกสารแบบอ่านอย่างเดียวทั้งหมดโดยไม่มีปุ่มแก้ไข ลบ post หรือ cancel
4. THE Goods_Receipt_UI SHALL ซ่อนปุ่มลบเอกสารเมื่อ `status` ของเอกสารเป็น Posted_Status หรือ Cancelled_Status

### Requirement 8: การรับรองเอกสาร (Post)

**User Story:** As a ผู้ใช้งานที่มีสิทธิ์รับรองเอกสาร, I want เปลี่ยนสถานะเอกสารจาก draft เป็น posted, so that เอกสารได้เลขที่และถูกล็อกข้อมูล

#### Acceptance Criteria

1. THE Goods_Receipt_UI SHALL แสดงปุ่ม Post เฉพาะเมื่อ Goods_Receipt ที่เปิดอยู่มี `status` เป็น Draft_Status
2. WHEN Current_User กดปุ่ม Post, THE Goods_Receipt_UI SHALL แสดงกล่องยืนยันที่ระบุว่าการรับรองเอกสารจะออกเลขที่เอกสารและล็อกข้อมูลก่อนเรียก `POST /goods-receipts/:id/post`
3. WHEN Current_User ยืนยันการ Post และ Goods_Receipt_API ตอบกลับสำเร็จ, THE Goods_Receipt_UI SHALL แสดงข้อมูลเอกสารที่อัปเดตแล้วรวมถึง `receiptNo`, `status`, `postedBy`, `postedAt`
4. IF Goods_Receipt_API ตอบกลับด้วยรหัสสถานะ 400 สำหรับคำขอ Post, THEN THE Goods_Receipt_UI SHALL แสดงข้อความข้อผิดพลาดที่ได้รับจาก Goods_Receipt_API
5. IF Goods_Receipt_API ตอบกลับด้วยรหัสสถานะ 409 สำหรับคำขอ Post, THEN THE Goods_Receipt_UI SHALL แสดงข้อความแจ้งว่าเอกสารไม่อยู่ในสถานะที่ Post ได้อีกต่อไปและโหลดข้อมูลเอกสารล่าสุด

### Requirement 9: การยกเลิกเอกสาร (Cancel)

**User Story:** As a ผู้ใช้งานที่มีสิทธิ์ยกเลิกเอกสาร, I want ยกเลิกเอกสารที่รับรองแล้วพร้อมระบุเหตุผล, so that เอกสารที่ผิดพลาดถูกบันทึกว่าไม่ใช้งานแล้วโดยไม่สูญเสียเลขที่เดิม

#### Acceptance Criteria

1. THE Goods_Receipt_UI SHALL แสดงปุ่ม Cancel เฉพาะเมื่อ Goods_Receipt ที่เปิดอยู่มี `status` เป็น Posted_Status
2. WHEN Current_User กดปุ่ม Cancel, THE Goods_Receipt_UI SHALL แสดงแบบฟอร์มให้กรอก `cancelReason` ก่อนส่งคำขอ
3. THE Goods_Receipt_UI SHALL กำหนดให้ `cancelReason` เป็นข้อมูลบังคับก่อนเรียก `POST /goods-receipts/:id/cancel`
4. WHEN Current_User ยืนยันการยกเลิกพร้อม `cancelReason` ที่กรอกแล้ว, THE Goods_Receipt_UI SHALL เรียก `POST /goods-receipts/:id/cancel` พร้อม field `cancelReason`
5. WHEN การยกเลิกสำเร็จ, THE Goods_Receipt_UI SHALL แสดงข้อมูลเอกสารที่อัปเดตแล้วรวมถึง `status`, `cancelledBy`, `cancelledAt`, `cancelReason` โดยยังคง `receiptNo` เดิม

### Requirement 10: การอัปโหลดและแสดงไฟล์แนบ

**User Story:** As a ผู้ใช้งานที่มีสิทธิ์สร้างหรือแก้ไขเอกสาร, I want แนบไฟล์หลักฐานประกอบเอกสาร, so that ฉันสามารถเก็บหลักฐานใบส่งของหรือรูปถ่ายไว้กับเอกสาร

#### Acceptance Criteria

1. THE Form_Screen SHALL อนุญาตให้ Current_User เลือกไฟล์ชนิด JPEG, PNG, WEBP หรือ PDF เท่านั้นสำหรับแนบเข้าเอกสาร
2. IF ไฟล์ที่ Current_User เลือกมีขนาดเกิน 10 MiB, THEN THE Form_Screen SHALL แสดงข้อความแจ้งเตือนและป้องกันการอัปโหลดไฟล์นั้น
3. IF จำนวน Attachment ของเอกสารที่เปิดอยู่รวมกับไฟล์ที่กำลังจะเพิ่มมากกว่า 10 ไฟล์, THEN THE Form_Screen SHALL แสดงข้อความแจ้งเตือนและป้องกันการอัปโหลดไฟล์เพิ่ม
4. WHEN Current_User เลือกไฟล์ที่ผ่านการตรวจสอบชนิดและขนาดแล้ว, THE Goods_Receipt_UI SHALL เรียก `POST /goods-receipts/attachments` แบบ multipart form-data เพื่อ stage ไฟล์นั้น
5. WHEN การ stage ไฟล์สำเร็จและ Current_User กำลังสร้างเอกสารใหม่, THE Goods_Receipt_UI SHALL เก็บ `filePath`, `fileName` ที่ได้รับไว้ในรายการ `attachments[]` ที่จะส่งพร้อมกับ `POST /goods-receipts`
6. WHEN การ stage ไฟล์สำเร็จและ Current_User กำลังแก้ไขเอกสารที่มีอยู่แล้ว, THE Goods_Receipt_UI SHALL เรียก `POST /goods-receipts/:id/attachments` พร้อมรายการ `attachments[]` ที่มี `docType`, `filePath`, `fileName`
7. THE Form_Screen SHALL ให้ Current_User เลือกค่า `docType` ของไฟล์แนบจากค่า `DELIVERY_NOTE`, `TAX_INVOICE`, `PHOTO`, `OTHER` ก่อนผูกไฟล์เข้าเอกสาร
8. THE Detail_Screen และ Form_Screen SHALL แสดงรายการ Attachment ทั้งหมดของเอกสารที่เปิดอยู่พร้อม `fileName`, `docType`, `mimeType`, `fileSize`
9. THE Goods_Receipt_UI SHALL แสดงปุ่มลบ Attachment เฉพาะเมื่อเอกสารที่เปิดอยู่มี `status` เป็น Draft_Status
10. WHEN Current_User กดลบ Attachment ของเอกสาร draft, THE Goods_Receipt_UI SHALL แสดงกล่องยืนยันก่อนเรียก `DELETE /goods-receipts/:id/attachments/:attachmentId`

### Requirement 11: การควบคุมการแสดงผลตามสิทธิ์ผู้ใช้

**User Story:** As a ผู้ดูแลระบบสิทธิ์, I want ปุ่มและ action บนหน้าจอ Goods Receipt แสดงตามสิทธิ์ที่ Current_User มีเท่านั้น, so that ผู้ใช้ไม่สามารถเรียก action ที่ตนเองไม่มีสิทธิ์ได้จากหน้าจอ

#### Acceptance Criteria

1. WHERE Current_User ไม่มีสิทธิ์ `GOODS_RECEIPT_VIEW` ใน Permission_Set, THE Goods_Receipt_UI SHALL ป้องกันการเข้าถึง List_Screen, Detail_Screen และ Form_Screen ของโมดูล Goods Receipt
2. WHERE Current_User ไม่มีสิทธิ์ `GOODS_RECEIPT_CREATE` ใน Permission_Set, THE List_Screen SHALL ซ่อนปุ่มสร้างเอกสารใหม่
3. WHERE Current_User ไม่มีสิทธิ์ `GOODS_RECEIPT_UPDATE` ใน Permission_Set, THE Form_Screen SHALL ซ่อนปุ่มบันทึกการแก้ไขเอกสาร draft และปุ่มลบ Attachment
4. WHERE Current_User ไม่มีสิทธิ์ `GOODS_RECEIPT_DELETE` ใน Permission_Set, THE Goods_Receipt_UI SHALL ซ่อนปุ่มลบเอกสาร draft
5. WHERE Current_User ไม่มีสิทธิ์ `GOODS_RECEIPT_POST` ใน Permission_Set, THE Goods_Receipt_UI SHALL ซ่อนปุ่ม Post
6. WHERE Current_User ไม่มีสิทธิ์ `GOODS_RECEIPT_CANCEL` ใน Permission_Set, THE Goods_Receipt_UI SHALL ซ่อนปุ่ม Cancel
7. WHERE Current_User มีสิทธิ์ `GOODS_RECEIPT_CREATE` หรือ `GOODS_RECEIPT_UPDATE` ใน Permission_Set อย่างน้อยหนึ่งสิทธิ์, THE Form_Screen SHALL แสดงปุ่มอัปโหลดไฟล์แนบ

### Requirement 12: การจัดการข้อผิดพลาดจาก Goods_Receipt_API

**User Story:** As a ผู้ใช้งาน, I want เห็นข้อความข้อผิดพลาดที่เข้าใจง่ายเมื่อการทำงานล้มเหลว, so that ฉันรู้ว่าต้องแก้ไขอะไรก่อนลองใหม่

#### Acceptance Criteria

1. IF Goods_Receipt_API ตอบกลับด้วยรหัสสถานะ 400 ต่อการสร้างหรือแก้ไขเอกสาร, THEN THE Goods_Receipt_UI SHALL แสดงข้อความข้อผิดพลาดที่ได้รับจาก Goods_Receipt_API ให้ Current_User เห็นโดยไม่ปิดฟอร์ม
2. IF Goods_Receipt_API ตอบกลับด้วยรหัสสถานะ 404 ต่อการเปิดเอกสาร ไฟล์แนบ หรือรายการอื่นที่ระบุด้วย id, THEN THE Goods_Receipt_UI SHALL แสดงข้อความว่าไม่พบรายการดังกล่าว
3. IF Goods_Receipt_API ตอบกลับด้วยรหัสสถานะ 409 เนื่องจาก `supplierDocNo` ซ้ำกับ Supplier เดียวกัน, THEN THE Goods_Receipt_UI SHALL แสดงข้อความแจ้งว่าเลขที่ใบส่งของนี้ถูกใช้กับ Supplier นี้ไปแล้ว
4. IF Goods_Receipt_API ตอบกลับด้วยรหัสสถานะ 409 เนื่องจาก `updatedAt` ไม่ตรงกัน, THEN THE Goods_Receipt_UI SHALL แสดงข้อความแจ้งว่าเอกสารถูกแก้ไขโดยผู้ใช้อื่นตามที่ระบุใน Requirement 6
5. IF Goods_Receipt_API ตอบกลับด้วยรหัสสถานะ 409 เนื่องจาก action ที่เรียกไม่ตรงกับสถานะปัจจุบันของเอกสาร, THEN THE Goods_Receipt_UI SHALL เรียก `GET /goods-receipts/:id` เพื่อโหลดข้อมูลเอกสารล่าสุด และแสดงข้อความแจ้งข้อผิดพลาดเมื่อการโหลดข้อมูลล่าสุดนั้นสำเร็จเท่านั้น

### Requirement 13: รูปแบบข้อมูลตัวเลขแบบทศนิยม

**User Story:** As a ผู้ใช้งาน, I want ตัวเลขจำนวนและราคาที่กรอกถูกส่งไปยัง Backend ด้วยความละเอียดที่ถูกต้อง, so that ข้อมูลจำนวนวัตถุดิบไม่คลาดเคลื่อนจากการปัดเศษของ floating point

#### Acceptance Criteria

1. THE Goods_Receipt_UI SHALL ส่งค่า Decimal_Field ทุกตัวเป็น string ไปยัง Goods_Receipt_API เสมอ ไม่ส่งเป็นชนิดตัวเลขแบบ JavaScript number
2. IF Current_User กรอกค่า Decimal_Field ที่มีทศนิยมมากกว่า 4 ตำแหน่ง, THEN THE Form_Screen SHALL แสดงข้อความแจ้งเตือนและป้องกันการบันทึกเอกสาร
3. THE Form_Screen SHALL แสดงค่า Decimal_Field ที่ได้รับจาก Goods_Receipt_API ตามรูปแบบ string ทศนิยมที่ได้รับโดยไม่แปลงผ่านชนิดตัวเลขแบบ JavaScript number ที่สูญเสียความละเอียด
</content>
