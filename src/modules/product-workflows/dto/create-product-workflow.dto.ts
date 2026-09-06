import { Transform, TransformFnParams, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';

const POSITIVE_DECIMAL_ID = /^[1-9]\d*$/;

function nullableTrimmedString(params: TransformFnParams): unknown {
  const value = params.value;
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export class CreateProductWorkflowStepDto {
  @IsString()
  @Matches(POSITIVE_DECIMAL_ID)
  processStepId: string;

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
