import { Transform, TransformFnParams, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

const POSITIVE_DECIMAL_ID = /^[1-9]\d*$/;

function nullableTrimmedString(params: TransformFnParams): unknown {
  const value = params.value;
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function trimString(params: TransformFnParams): unknown {
  const value = params.value;
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateProductWorkflowStepDto {
  @Transform(trimString)
  @IsString()
  @MaxLength(255)
  stepName: string;

  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsString()
  description?: string | null;
}

export class CreateProductWorkflowDto {
  @IsString()
  @Matches(POSITIVE_DECIMAL_ID)
  productId: string;

  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsString()
  remark?: string | null;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CreateProductWorkflowStepDto)
  steps: CreateProductWorkflowStepDto[];
}
