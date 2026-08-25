import { Transform, TransformFnParams } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

const POSITIVE_DECIMAL_ID = /^[1-9]\d*$/;

function nullableTrimmedString(params: TransformFnParams): unknown {
  const value = params.value;
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export class CreateBomItemDto {
  @IsString()
  @Matches(POSITIVE_DECIMAL_ID)
  materialId: string;

  @IsNumber()
  @Min(0.0001)
  quantity: number;

  @IsString()
  @Matches(POSITIVE_DECIMAL_ID)
  unitId: string;

  @IsOptional()
  @IsBoolean()
  isScrap?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  wastagePercent?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  remark?: string | null;
}

export class CreateBomDto {
  @IsString()
  @Matches(POSITIVE_DECIMAL_ID)
  productId: string;

  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  specification?: string | null;

  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsString()
  remark?: string | null;

  @IsOptional()
  @IsDateString()
  effectiveFrom?: string | null;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string | null;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => CreateBomItemDto)
  items: CreateBomItemDto[];
}
