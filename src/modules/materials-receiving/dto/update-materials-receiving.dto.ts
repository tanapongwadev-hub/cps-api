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

/**
 * Update draft เท่านั้น — ทุก field เป็น optional และต้องส่ง updatedAt
 * เพื่อทำ optimistic concurrency check
 */
export class UpdateMaterialsReceivingDto {
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @Matches(POSITIVE_DECIMAL_ID, { message: 'supplierId must be a valid id' })
  supplierId?: string;

  @Transform(decimalString)
  @IsOptional()
  @IsString()
  @Matches(DECIMAL_18_4, {
    message:
      'receiveQuantity must be a non-negative number with up to 4 decimals',
  })
  receiveQuantity?: string;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @Matches(ISO_DATE, {
    message: 'supplierProductionDate must be in YYYY-MM-DD format',
  })
  supplierProductionDate?: string;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @Matches(ISO_DATE, {
    message: 'receiveDate must be in YYYY-MM-DD format',
  })
  receiveDate?: string;

  /** เลขที่ PO — header ของเอกสาร (optional) */
  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsString()
  @MaxLength(30)
  @Matches(PO_NO_PATTERN, {
    message: 'poNo must be 1-30 chars of letters, numbers, dash, underscore, slash or space',
  })
  poNo?: string | null;

  @Transform(({ value }) => value as number | undefined)
  @IsOptional()
  @IsInt()
  @Min(1)
  packingQuantityOverride?: number;

  /**
   * Optional: override `ratio` at update time.
   * Only meaningful for materialType = PIPE / SHEET / COIL.
   */
  @Transform(({ value }) => value as number | undefined)
  @IsOptional()
  @IsInt()
  @Min(1)
  ratioOverride?: number;

  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  attachmentUrl?: string | null;

  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsString()
  @MaxLength(255)
  attachmentName?: string | null;

  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsString()
  @MaxLength(80)
  remark?: string | null;

  /** Optimistic concurrency token — ต้องตรงกับ updatedAt ของ receiving */
  @Transform(trimString)
  @IsString()
  updatedAt: string;
}
