import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const ID_PATTERN = /^[1-9]\d*$/;

export const SALES_ORDER_STATUSES = [
  'DRAFT',
  'CONFIRMED',
  'PARTIALLY_SHIPPED',
  'SHIPPED',
  'CANCELLED',
] as const;
export type SalesOrderStatus = (typeof SALES_ORDER_STATUSES)[number];

export const SALES_JOB_ORDER_STATUSES = [
  'WAITING_PICKING',
  'READY_TO_ISSUE',
  'PARTIALLY_ISSUED',
  'ISSUED',
  'CANCELLED',
] as const;
export type SalesJobOrderStatus = (typeof SALES_JOB_ORDER_STATUSES)[number];

const trimOrNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || null : value;

export class SalesOrderLineDto {
  @Matches(ID_PATTERN)
  productId: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(trimOrNull)
  remark?: string | null;
}

export class CreateSalesOrderDto {
  @Matches(ID_PATTERN)
  customerId: string;

  @IsDateString({ strict: true })
  orderDate: string;

  @IsOptional()
  @IsDateString({ strict: true })
  dueDate?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(trimOrNull)
  customerPo?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @Transform(trimOrNull)
  remark?: string | null;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => SalesOrderLineDto)
  lines: SalesOrderLineDto[];
}

export class UpdateSalesOrderDto extends CreateSalesOrderDto {
  @IsInt()
  version: number;
}

export class VersionDto {
  @IsInt()
  version: number;
}

export class CancelSalesOrderDto extends VersionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}

class PageQuery {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Transform(({ value }) => Number.parseInt(String(value), 10))
  page = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Transform(({ value }) =>
    Math.min(Number.parseInt(String(value), 10) || 20, 200),
  )
  limit = 20;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  dateFrom?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  dateTo?: string;
}

export class ListSalesOrdersQueryDto extends PageQuery {
  @IsOptional()
  @IsIn(SALES_ORDER_STATUSES)
  status?: SalesOrderStatus;

  @IsOptional()
  @Matches(ID_PATTERN)
  customerId?: string;
}

export class ListSalesJobOrdersQueryDto extends PageQuery {
  @IsOptional()
  @IsIn(SALES_JOB_ORDER_STATUSES)
  status?: SalesJobOrderStatus;
}

export class SalesReportQueryDto extends PageQuery {
  @IsOptional()
  @Matches(ID_PATTERN)
  customerId?: string;

  @IsOptional()
  @Matches(ID_PATTERN)
  productId?: string;
}

export class PickSalesJobOrderDto extends VersionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  qrCode: string;
}

export class IssueSalesJobOrderItemDto {
  @Matches(ID_PATTERN)
  reservationId: string;

  @IsInt()
  @Min(1)
  quantity: number;
}

export class IssueSalesJobOrderDto extends VersionDto {
  @IsUUID('4')
  requestId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => IssueSalesJobOrderItemDto)
  items: IssueSalesJobOrderItemDto[];
}
