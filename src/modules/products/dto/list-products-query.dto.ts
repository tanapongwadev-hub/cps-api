import { Transform, TransformFnParams } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

function trimString(params: TransformFnParams): unknown {
  const value = params.value;
  return typeof value === 'string' ? value.trim() : value;
}

export const PRODUCT_SORT_COLUMNS = [
  'code',
  'name',
  'isActive',
  'createdAt',
  'updatedAt',
] as const;
export type ProductSortBy = (typeof PRODUCT_SORT_COLUMNS)[number];

export class ListProductsQueryDto {
  @Transform(trimString)
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  modelId?: string;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  customerId?: string;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  productTypeId?: string;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  locationId?: string;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  processLineId?: string;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  sortBy?: ProductSortBy;

  @Transform(trimString)
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}
