import { Transform, TransformFnParams } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

const POSITIVE_DECIMAL_ID = /^[1-9]\d*$/;

function nullableTrimmedString(params: TransformFnParams): unknown {
  const value = params.value;
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export class UpdateProductWorkflowDto {
  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsString()
  remark?: string | null;

  @IsString()
  @IsNotEmpty()
  updatedAt: string;
}

export class AddProductWorkflowStepDto {
  @IsString()
  @Matches(POSITIVE_DECIMAL_ID)
  processStepId: string;

  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsString()
  description?: string | null;
}
