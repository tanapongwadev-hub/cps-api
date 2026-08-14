import { Transform } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import {
  DECIMAL_18_4,
  ISO_DATE,
  PO_NO_PATTERN,
  POSITIVE_DECIMAL_ID,
  decimalString,
  nullableTrimmedString,
  trimString,
} from './transforms';

export class CreateMaterialsReceivingDto {
  @Transform(trimString)
  @IsString()
  @Matches(POSITIVE_DECIMAL_ID, { message: 'materialId must be a valid id' })
  materialId: string;

  /**
   * Supplier — optional; if omitted the service auto-derives from material's supplier list.
   * Required when material has more than one active supplier.
   */
  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsString()
  @Matches(POSITIVE_DECIMAL_ID, { message: 'supplierId must be a valid id' })
  supplierId?: string;

  @Transform(decimalString)
  @IsString()
  @Matches(DECIMAL_18_4, {
    message:
      'receiveQuantity must be a non-negative number with up to 4 decimals',
  })
  receiveQuantity: string;

  @Transform(trimString)
  @IsString()
  @Matches(ISO_DATE, {
    message: 'supplierProductionDate must be in YYYY-MM-DD format',
  })
  supplierProductionDate: string;

  @Transform(trimString)
  @IsString()
  @Matches(ISO_DATE, {
    message: 'receiveDate must be in YYYY-MM-DD format',
  })
  receiveDate: string;

  /** เลขที่ PO — header ของเอกสาร (optional) */
  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsString()
  @MaxLength(30)
  @Matches(PO_NO_PATTERN, {
    message: 'poNo must be 1-30 chars of letters, numbers, dash, underscore, slash or space',
  })
  poNo?: string | null;

  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsString()
  remark?: string | null;

  /**
   * ใช้กรณี master.materials.packing_quantity ยังไม่ได้ตั้งค่า
   * ถ้าไม่ส่ง ระบบจะอ่านจาก materials.packing_quantity ณ ตอนสร้าง
   */
  @Transform(({ value }) => value as number | undefined)
  @IsOptional()
  @IsInt()
  @Min(1)
  packingQuantityOverride?: number;

  /**
   * Optional: override `ratio` at receive time (snapshot).
   * If omitted, the service reads from `materials.ratio`.
   * Only meaningful for materialType = PIPE / SHEET / COIL.
   */
  @Transform(({ value }) => value as number | undefined)
  @IsOptional()
  @IsInt()
  @Min(1)
  ratioOverride?: number;

  /** Path ของไฟล์แนบ (uploaded แล้ว — เช่น /uploads/materials-receiving/xxx.pdf) */
  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  attachmentUrl?: string | null;

  /** ชื่อไฟล์เดิมของไฟล์แนบ (สำหรับ download) */
  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsString()
  @MaxLength(255)
  attachmentName?: string | null;
}
