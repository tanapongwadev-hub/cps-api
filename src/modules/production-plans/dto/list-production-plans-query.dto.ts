import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { PRODUCTION_PLAN_STATUSES } from '../production-plan.entity';

export class ListProductionPlansQueryDto {
  @IsOptional()
  @IsIn(['product', 'material'])
  targetType?: 'product' | 'material';

  /** Only plans with a line whose target's ACTIVE workflow has a step with this process-step code. */
  @IsOptional()
  @IsString()
  workflowStepCode?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Transform(({ value }) => Number.parseInt(String(value), 10))
  page = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Transform(({ value }) => Number.parseInt(String(value), 10))
  limit = 20;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(PRODUCTION_PLAN_STATUSES)
  status?: (typeof PRODUCTION_PLAN_STATUSES)[number];

  @IsOptional()
  @IsString()
  needByDateFrom?: string;

  @IsOptional()
  @IsString()
  needByDateTo?: string;
}
