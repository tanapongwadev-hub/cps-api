import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class ListProductionOrdersQueryDto {
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

  /** Matches order code, plan code, or product code. */
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  status?: string;

  /** Comma-separated production plan ids (to flag plans already ordered). */
  @IsOptional()
  @IsString()
  planIds?: string;
}
