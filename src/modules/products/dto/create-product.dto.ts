import { Transform, TransformFnParams } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

const POSITIVE_DECIMAL_ID = /^[1-9]\d*$/;

function trimString(params: TransformFnParams): unknown {
  const value = params.value;
  return typeof value === 'string' ? value.trim() : value;
}

function nullableTrimmedString(params: TransformFnParams): unknown {
  const value = params.value;
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export class CreateProductDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  code: string;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  // --- FKs (required) ---

  @Transform(trimString)
  @IsString()
  @Matches(POSITIVE_DECIMAL_ID)
  unitId: string;

  @Transform(trimString)
  @IsString()
  @Matches(POSITIVE_DECIMAL_ID)
  modelId: string;

  @Transform(trimString)
  @IsString()
  @Matches(POSITIVE_DECIMAL_ID)
  customerId: string;

  @Transform(trimString)
  @IsString()
  @Matches(POSITIVE_DECIMAL_ID)
  locationId: string;

  @Transform(trimString)
  @IsString()
  @Matches(POSITIVE_DECIMAL_ID)
  productTypeId: string;

  @Transform(trimString)
  @IsString()
  @Matches(POSITIVE_DECIMAL_ID)
  deliveryTypeId: string;

  @Transform(trimString)
  @IsString()
  @Matches(POSITIVE_DECIMAL_ID)
  loadingPointId: string;

  @Transform(trimString)
  @IsString()
  @Matches(POSITIVE_DECIMAL_ID)
  processLineId: string;

  // --- Production parameters ---

  @Transform(({ value }) => (value === '' || value === null || value === undefined ? null : value))
  @IsOptional()
  @IsInt()
  @Min(1)
  packing?: number;

  @Transform(({ value }) => (value === '' || value === null || value === undefined ? null : value))
  @IsOptional()
  @IsInt()
  @Min(1)
  lotSize?: number;

  // --- Optional overrides for auto-computed stock ---

  /**
   * Safety stock override. If omitted, server computes from lotSize.
   *   safety_stock = lotSize
   */
  @Transform(({ value }) => (value === '' || value === null || value === undefined ? null : value))
  @IsOptional()
  @IsInt()
  @Min(0)
  safetyStock?: number;

  /**
   * Min stock override. If omitted, server computes from packing.
   *   min_stock = packing
   */
  @Transform(({ value }) => (value === '' || value === null || value === undefined ? null : value))
  @IsOptional()
  @IsInt()
  @Min(0)
  minStock?: number;

  // --- Misc ---

  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsString()
  @MaxLength(50)
  scale?: string | null;

  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  productImagePath?: string | null;

  @Transform(trimString)
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
