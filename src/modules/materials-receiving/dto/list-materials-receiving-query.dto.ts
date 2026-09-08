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
import { MATERIAL_RECEIVING_STATUSES } from '../../../entities/inventory/material-receiving.entity';
import {
  INTERNAL_LOT_NO_PATTERN,
  ISO_DATE,
  POSITIVE_DECIMAL_ID,
  nullableTrimmedString,
  queryBoolean,
} from './transforms';

export const MATERIAL_RECEIVING_SORT_FIELDS = [
  'internalLotNo',
  'receiveDate',
  'supplierLotNo',
  'createdAt',
  'updatedAt',
] as const;

export type MaterialsReceivingSortBy =
  (typeof MATERIAL_RECEIVING_SORT_FIELDS)[number];
export type MaterialsReceivingSortOrder = 'asc' | 'desc';

export class ListMaterialsReceivingQueryDto {
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
  @IsIn(MATERIAL_RECEIVING_STATUSES)
  status?: (typeof MATERIAL_RECEIVING_STATUSES)[number];

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
  @Matches(INTERNAL_LOT_NO_PATTERN, {
    message:
      'internalLotNo must look like CCI-{YY}{MonthCode}{DD}-{SEQ}, e.g. CCI-26J07-001',
  })
  internalLotNo?: string;

  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsString()
  @Matches(ISO_DATE, {
    message: 'receiveDateFrom must be in YYYY-MM-DD format',
  })
  receiveDateFrom?: string;

  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsString()
  @Matches(ISO_DATE, { message: 'receiveDateTo must be in YYYY-MM-DD format' })
  receiveDateTo?: string;

  @Transform(queryBoolean)
  @IsOptional()
  @IsBoolean()
  hasPackages?: boolean;

  @IsIn(MATERIAL_RECEIVING_SORT_FIELDS)
  sortBy: MaterialsReceivingSortBy = 'receiveDate';

  @IsIn(['asc', 'desc'])
  sortOrder: MaterialsReceivingSortOrder = 'desc';
}
