import { Transform, TransformFnParams, Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsString,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

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

export class ReorderMenuItemDto {
  @Transform(sourceValue)
  @IsString()
  @IsNotEmpty()
  id: string;

  @Transform(sourceValue)
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  @IsNotEmpty()
  parentId: string | null;

  @Transform(sourceValue)
  @IsInt()
  @Min(0)
  sortOrder: number;
}

export class ReorderMenusDto {
  @Transform(sourceValue)
  @IsString()
  @IsNotEmpty()
  version: string;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ReorderMenuItemDto)
  items: ReorderMenuItemDto[];
}
