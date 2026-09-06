import { Transform, TransformFnParams } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

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
  @Transform(trimString)
  @IsString()
  @MaxLength(255)
  stepName: string;

  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsString()
  description?: string | null;
}
