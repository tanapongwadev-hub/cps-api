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
  IDEMPOTENCY_KEY_PATTERN,
  ISO_DATE,
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

  @Transform(trimString)
  @IsString()
  @Matches(POSITIVE_DECIMAL_ID, { message: 'supplierId must be a valid id' })
  supplierId: string;

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

  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Matches(IDEMPOTENCY_KEY_PATTERN, {
    message:
      'idempotencyKey must be 8-80 chars of letters, numbers, dash or underscore',
  })
  idempotencyKey?: string | null;

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
}
