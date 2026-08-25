import { Transform, TransformFnParams } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
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

export class UpdateProductDto {
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(50)
  code?: string;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  // FKs (optional on update, but must be valid if provided)
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @Matches(POSITIVE_DECIMAL_ID)
  unitId?: string;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @Matches(POSITIVE_DECIMAL_ID)
  modelId?: string;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @Matches(POSITIVE_DECIMAL_ID)
  customerId?: string;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @Matches(POSITIVE_DECIMAL_ID)
  locationId?: string;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @Matches(POSITIVE_DECIMAL_ID)
  productTypeId?: string;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @Matches(POSITIVE_DECIMAL_ID)
  deliveryTypeId?: string;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @Matches(POSITIVE_DECIMAL_ID)
  loadingPointId?: string;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @Matches(POSITIVE_DECIMAL_ID)
  processLineId?: string;

  // Production parameters
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

  @Transform(({ value }) => (value === '' || value === null || value === undefined ? null : value))
  @IsOptional()
  @IsInt()
  @Min(0)
  safetyStock?: number;

  @Transform(({ value }) => (value === '' || value === null || value === undefined ? null : value))
  @IsOptional()
  @IsInt()
  @Min(0)
  minStock?: number;

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

  @IsString()
  @IsNotEmpty()
  updatedAt: string;
}
