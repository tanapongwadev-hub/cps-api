import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import { MATERIAL_JOB_ORDER_STATUSES } from '../material-job-order.entity';

export class ListMaterialJobOrdersQueryDto {
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

  /** Matches against Job Order code, Production Plan code, or Product code. */
  @IsOptional()
  @IsString()
  search?: string;

  /** Comma-separated list of statuses, e.g. "WAITING_PICKING,READY_TO_ISSUE". */
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  approvedDateFrom?: string;

  @IsOptional()
  @IsString()
  approvedDateTo?: string;
}

export function parseStatusFilter(
  value: string | undefined,
): Array<(typeof MATERIAL_JOB_ORDER_STATUSES)[number]> {
  if (!value) return [];
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry): entry is (typeof MATERIAL_JOB_ORDER_STATUSES)[number] =>
      (MATERIAL_JOB_ORDER_STATUSES as readonly string[]).includes(entry),
    );
}
