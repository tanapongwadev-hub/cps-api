import { Transform, TransformFnParams } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const COLORS = ['info', 'success', 'warning', 'danger', 'muted'] as const;

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

function trimString(params: TransformFnParams): unknown {
  const value = sourceValue(params);
  return typeof value === 'string' ? value.trim() : value;
}

function nullableTrimmedString(params: TransformFnParams): unknown {
  const value = sourceValue(params);
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export class CreateStatusItemDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  code: string;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nameTh: string;

  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  nameEn?: string | null;

  @Transform(trimString)
  @IsString()
  @IsIn(COLORS)
  @MaxLength(20)
  color: string = 'info';

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  module: string;

  @Transform(sourceValue)
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @Transform(sourceValue)
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9999)
  sortOrder?: number;

  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsString()
  description?: string | null;

  @Transform(sourceValue)
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
