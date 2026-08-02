import { Transform, TransformFnParams } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

const POSITIVE_DECIMAL_ID = /^[1-9]\d*$/;

function trimString({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function nullableTrimmedString({ value }: TransformFnParams): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function trimStringArray({ value }: TransformFnParams): unknown {
  if (!Array.isArray(value)) return value;
  const items: unknown[] = value;
  return items.map((item) => (typeof item === 'string' ? item.trim() : item));
}

export class UpdateMaterialDto {
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  code?: string;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name?: string;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @Matches(POSITIVE_DECIMAL_ID)
  unitId?: string;

  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsString()
  @Matches(POSITIVE_DECIMAL_ID)
  deliveryTypeId?: string | null;

  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsString()
  @Matches(POSITIVE_DECIMAL_ID)
  modelId?: string | null;

  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsString()
  @Matches(POSITIVE_DECIMAL_ID)
  loadingPointId?: string | null;

  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsString()
  @MaxLength(255)
  processLineName?: string | null;

  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsString()
  @MaxLength(255)
  scale?: string | null;

  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  imagePath?: string | null;

  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsString()
  specification?: string | null;

  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsString()
  description?: string | null;

  @Transform(trimStringArray)
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @Matches(POSITIVE_DECIMAL_ID, { each: true })
  supplierIds?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsISO8601({ strict: true })
  updatedAt: string;
}
