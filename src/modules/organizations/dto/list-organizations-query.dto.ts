import { Transform, TransformFnParams, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export const ORG_SORT_FIELDS = [
  'code',
  'nameTh',
  'type',
  'isActive',
  'createdAt',
  'updatedAt',
] as const;
export type OrganizationSortBy = (typeof ORG_SORT_FIELDS)[number];

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

export class ListOrganizationsQueryDto {
  @Type(() => Number) @IsInt() @Min(1) page: number = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) limit: number = 20;
  @Transform(nullableTrimmedString) @IsOptional() @IsString() search?:
    string | null;
  @Transform(queryBoolean) @IsOptional() @IsBoolean() isActive?: boolean;
  @Transform(nullableTrimmedString) @IsOptional() @IsString() type?:
    string | null;
  @IsIn(ORG_SORT_FIELDS) sortBy: OrganizationSortBy = 'code';
  @IsIn(['asc', 'desc']) sortOrder: 'asc' | 'desc' = 'asc';
}
