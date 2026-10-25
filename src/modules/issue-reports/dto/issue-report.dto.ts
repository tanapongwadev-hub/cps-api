import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const ISSUE_DOCUMENT_TYPES = [
  'MATERIAL_RECEIVING',
  'MATERIAL_DISBURSEMENT',
  'MATERIAL_JOB_ORDER',
  'MATERIAL_PROCESSING',
  'PRODUCTION_PLAN',
  'PRODUCTION_ORDER',
  'SALES_ORDER',
  'SALES_JOB_ORDER',
  'OTHER',
] as const;
export const ISSUE_SEVERITIES = ['LOW', 'MEDIUM', 'HIGH'] as const;
export const ISSUE_STATUSES = [
  'OPEN',
  'IN_PROGRESS',
  'RESOLVED',
  'CLOSED',
] as const;

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateIssueReportDto {
  @IsIn(ISSUE_DOCUMENT_TYPES)
  documentType!: (typeof ISSUE_DOCUMENT_TYPES)[number];

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  documentNo!: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(4000)
  description?: string;

  @IsOptional()
  @IsIn(ISSUE_SEVERITIES)
  severity?: (typeof ISSUE_SEVERITIES)[number];
}

export class UpdateIssueReportDto {
  @IsIn(ISSUE_STATUSES)
  status!: (typeof ISSUE_STATUSES)[number];

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(4000)
  resolution?: string;
}

export class ListIssueReportsQueryDto {
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsIn(ISSUE_STATUSES)
  status?: (typeof ISSUE_STATUSES)[number];

  @IsOptional()
  @IsIn(ISSUE_DOCUMENT_TYPES)
  documentType?: (typeof ISSUE_DOCUMENT_TYPES)[number];

  @IsOptional()
  @IsIn(ISSUE_SEVERITIES)
  severity?: (typeof ISSUE_SEVERITIES)[number];
}
