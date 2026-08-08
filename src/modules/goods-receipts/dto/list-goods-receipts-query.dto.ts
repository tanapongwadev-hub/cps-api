import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { GOODS_RECEIPT_STATUSES } from '../../../entities/inventory/goods-receipt.entity';
import {
  ISO_DATE,
  POSITIVE_DECIMAL_ID,
  nullableTrimmedString,
  queryBoolean,
} from './transforms';

export const GOODS_RECEIPT_SORT_FIELDS = [
  'receiptNo',
  'receiptDate',
  'supplierDocNo',
  'createdAt',
  'updatedAt',
] as const;

export type GoodsReceiptSortBy = (typeof GOODS_RECEIPT_SORT_FIELDS)[number];
export type GoodsReceiptSortOrder = 'asc' | 'desc';

export class ListGoodsReceiptsQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsString()
  search?: string | null;

  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsIn(GOODS_RECEIPT_STATUSES)
  status?: (typeof GOODS_RECEIPT_STATUSES)[number];

  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsString()
  @Matches(POSITIVE_DECIMAL_ID, { message: 'supplierId must be a valid id' })
  supplierId?: string;

  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsString()
  @Matches(POSITIVE_DECIMAL_ID, { message: 'materialId must be a valid id' })
  materialId?: string;

  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsString()
  @Matches(ISO_DATE, {
    message: 'receiptDateFrom must be in YYYY-MM-DD format',
  })
  receiptDateFrom?: string;

  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsString()
  @Matches(ISO_DATE, { message: 'receiptDateTo must be in YYYY-MM-DD format' })
  receiptDateTo?: string;

  @Transform(queryBoolean)
  @IsOptional()
  @IsBoolean()
  hasRejection?: boolean;

  @IsIn(GOODS_RECEIPT_SORT_FIELDS)
  sortBy: GoodsReceiptSortBy = 'receiptDate';

  @IsIn(['asc', 'desc'])
  sortOrder: GoodsReceiptSortOrder = 'desc';
}
