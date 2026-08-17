import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Transform } from 'class-transformer';

export const DISBURSEMENT_SORT_COLUMNS = [
  'disbursementNo',
  'disbursementDate',
  'createdAt',
] as const;
export type DisbursementSortBy = (typeof DISBURSEMENT_SORT_COLUMNS)[number];

export class ListMaterialsDisbursementQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Transform(({ value }) => parseInt(value, 10))
  page?: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Transform(({ value }) => parseInt(value, 10))
  limit?: number = 20;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(['draft', 'confirmed', 'cancelled'])
  status?: string;

  @IsOptional()
  @IsIn(['stock_cut', 'production'])
  disbursementType?: string;

  @IsOptional()
  @IsString()
  disbursementDateFrom?: string;

  @IsOptional()
  @IsString()
  disbursementDateTo?: string;

  @IsOptional()
  @IsIn(DISBURSEMENT_SORT_COLUMNS)
  sortBy?: DisbursementSortBy = 'disbursementDate';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';
}
