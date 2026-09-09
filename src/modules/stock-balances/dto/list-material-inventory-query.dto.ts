import { Transform, TransformFnParams, Type } from 'class-transformer';
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
import { MaterialType } from '../../../entities/master/material.entity';

const POSITIVE_DECIMAL_ID = /^[1-9]\d*$/;

export const MATERIAL_STOCK_STATUSES = [
  'NORMAL',
  'LOW_STOCK',
  'OUT_OF_STOCK',
] as const;
export type MaterialStockStatus = (typeof MATERIAL_STOCK_STATUSES)[number];

export const MATERIAL_INVENTORY_SORT_FIELDS = [
  'code',
  'name',
  'currentStock',
  'lastReceivedAt',
] as const;
export type MaterialInventorySortBy =
  (typeof MATERIAL_INVENTORY_SORT_FIELDS)[number];

function sourceValue(params: TransformFnParams): unknown {
  const source: unknown = params.obj;
  if (
    source !== null &&
    typeof source === 'object' &&
    Object.prototype.hasOwnProperty.call(source, params.key)
  ) {
    return Reflect.get(source, params.key);
  }
  return params.value;
}

function nullableTrimmedString(params: TransformFnParams): unknown {
  const value = sourceValue(params);
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function queryBoolean(params: TransformFnParams): unknown {
  const value = sourceValue(params);
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

export class ListMaterialInventoryQueryDto {
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

  @Transform(queryBoolean)
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsIn(['PC', 'OF', 'OF_MAT'])
  type?: MaterialType | null;

  @Transform(nullableTrimmedString)
  @IsOptional()
  @Matches(POSITIVE_DECIMAL_ID)
  supplierId?: string | null;

  @Transform(nullableTrimmedString)
  @IsOptional()
  @Matches(POSITIVE_DECIMAL_ID)
  modelId?: string | null;

  @Transform(nullableTrimmedString)
  @IsOptional()
  @Matches(POSITIVE_DECIMAL_ID)
  loadingPointId?: string | null;

  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsString()
  processLineName?: string | null;

  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsIn(MATERIAL_STOCK_STATUSES)
  stockStatus?: MaterialStockStatus | null;

  @IsIn(MATERIAL_INVENTORY_SORT_FIELDS)
  sortBy: MaterialInventorySortBy = 'code';

  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'asc';
}
