import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsString,
  IsNotEmpty,
  IsDateString,
  IsOptional,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Transform, TransformFnParams, Type } from 'class-transformer';
import { CreateBomItemDto } from './create-bom.dto';

function nullableTrimmedString(params: TransformFnParams): unknown {
  const value = params.value;
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export class UpdateBomDto {
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

  @IsString()
  @IsNotEmpty()
  updatedAt: string;
}

export class ReplaceBomContentDto {
  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  specification?: string | null;

  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsString()
  remark?: string | null;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => CreateBomItemDto)
  items: CreateBomItemDto[];
}

export class AddBomItemDto {
  @IsString()
  materialId: string;

  @IsOptional()
  quantity?: number;

  @IsString()
  unitId: string;

  @IsOptional()
  isScrap?: boolean;

  @IsOptional()
  wastagePercent?: number | null;

  @IsOptional()
  remark?: string | null;
}
