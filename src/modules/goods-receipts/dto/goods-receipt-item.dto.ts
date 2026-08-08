import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import {
  DECIMAL_18_4,
  ISO_DATE,
  POSITIVE_DECIMAL_ID,
  decimalString,
  nullableDecimalString,
  nullableTrimmedString,
  sourceValue,
  trimString,
} from './transforms';

export class GoodsReceiptItemDto {
  @Transform(trimString)
  @IsString()
  @Matches(POSITIVE_DECIMAL_ID, { message: 'materialId must be a valid id' })
  materialId: string;

  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsString()
  @MaxLength(50)
  poNo?: string | null;

  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsString()
  @MaxLength(50)
  supplierDocNo?: string | null;

  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsString()
  @Matches(ISO_DATE, {
    message: 'supplierDocDate must be in YYYY-MM-DD format',
  })
  supplierDocDate?: string | null;

  @Transform(sourceValue)
  @IsOptional()
  @IsBoolean()
  noSupplierDocument?: boolean;

  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  filePath?: string | null;

  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsString()
  @MaxLength(255)
  fileName?: string | null;

  @Transform(decimalString)
  @IsOptional()
  @IsString()
  @Matches(DECIMAL_18_4, {
    message: 'qtyDelivered must be a non-negative number with up to 4 decimals',
  })
  qtyDelivered?: string;

  @Transform(decimalString)
  @IsString()
  @Matches(DECIMAL_18_4, {
    message: 'qtyReceived must be a non-negative number with up to 4 decimals',
  })
  qtyReceived: string;

  @Transform(decimalString)
  @IsOptional()
  @IsString()
  @Matches(DECIMAL_18_4, {
    message: 'qtyRejected must be a non-negative number with up to 4 decimals',
  })
  qtyRejected?: string;

  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsString()
  @Matches(POSITIVE_DECIMAL_ID, {
    message: 'rejectReasonId must be a valid id',
  })
  rejectReasonId?: string | null;

  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsString()
  rejectNote?: string | null;

  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsString()
  @MaxLength(50)
  lotNo?: string | null;

  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsString()
  @Matches(ISO_DATE, { message: 'productionDate must be in YYYY-MM-DD format' })
  productionDate?: string | null;

  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsString()
  @Matches(ISO_DATE, { message: 'expiryDate must be in YYYY-MM-DD format' })
  expiryDate?: string | null;

  @Transform(nullableDecimalString)
  @IsOptional()
  @IsString()
  @Matches(DECIMAL_18_4, {
    message: 'unitPrice must be a non-negative number with up to 4 decimals',
  })
  unitPrice?: string | null;

  @Transform(nullableDecimalString)
  @IsOptional()
  @IsString()
  @Matches(DECIMAL_18_4, {
    message: 'lineAmount must be a non-negative number with up to 4 decimals',
  })
  lineAmount?: string | null;

  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsString()
  remark?: string | null;
}
