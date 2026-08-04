import { Transform, TransformFnParams } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

const TYPES = ['headquarters', 'branch', 'subsidiary', 'department'] as const;

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

export class CreateOrganizationDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  code: string;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  nameTh: string;

  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsString()
  @MaxLength(255)
  nameEn?: string | null;

  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsString()
  @MaxLength(20)
  taxId?: string | null;

  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsString()
  address?: string | null;

  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string | null;

  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsString()
  @IsEmail()
  @MaxLength(255)
  email?: string | null;

  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsString()
  @MaxLength(255)
  website?: string | null;

  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  logoUrl?: string | null;

  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsString()
  @Matches(/^[1-9]\d*$/)
  parentId?: string | null;

  @Transform(trimString)
  @IsString()
  @IsIn(TYPES)
  type: (typeof TYPES)[number] = 'department';

  @Transform(sourceValue)
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
