import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { STOCK_TRANSACTION_TYPES } from '../../../entities/inventory/stock-transaction.entity';
import {
  MaterialShape,
  MaterialType,
} from '../../../entities/master/material.entity';
import { MATERIAL_RECEIVING_STATUSES } from '../../../entities/inventory/material-receiving.entity';
import { DISBURSEMENT_STATUSES } from '../../materials-disbursement/materials-disbursement.entity';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const POSITIVE_DECIMAL_ID = /^[1-9]\d*$/;

function nullableTrimmedString({ value }: { value: unknown }): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

/** Union of the two documents' statuses — a movement's linked document is
 * either a MaterialReceiving or a MaterialsDisbursement, never both. */
const TRACEABILITY_STATUSES = Array.from(
  new Set([...MATERIAL_RECEIVING_STATUSES, ...DISBURSEMENT_STATUSES]),
);

/**
 * Single filter contract shared by the summary, the paginated movement
 * table, every drill-down, and (on the frontend) CSV/Excel/PDF export — per
 * the traceability spec's "Export ต้องอ้างอิง Filter เดียวกับหน้าจอ" and
 * "ทุก Filter ต้อง apply กับทั้ง Summary และ Detail" requirements. Do not
 * fork a second filter shape for exports; reuse this DTO's query string.
 */
export class QueryMaterialTraceabilityDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit: number = 50;

  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsString()
  @Matches(ISO_DATE, { message: 'dateFrom must be in YYYY-MM-DD format' })
  dateFrom?: string;

  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsString()
  @Matches(ISO_DATE, { message: 'dateTo must be in YYYY-MM-DD format' })
  dateTo?: string;

  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsString()
  @Matches(POSITIVE_DECIMAL_ID, { message: 'materialId must be a valid id' })
  materialId?: string;

  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsString()
  materialCode?: string;

  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsString()
  materialName?: string;

  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsIn(Object.values(MaterialType))
  materialType?: MaterialType;

  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsIn(Object.values(MaterialShape))
  shape?: MaterialShape;

  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsString()
  internalLotNo?: string;

  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsString()
  supplierLotNo?: string;

  /** MAIN QR = the receiving's own internal lot no (or a partial match). */
  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsString()
  mainQr?: string;

  /** SUB QR = a package's lot-detail no (or a partial match). */
  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsString()
  subQr?: string;

  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsIn(STOCK_TRANSACTION_TYPES)
  transactionType?: (typeof STOCK_TRANSACTION_TYPES)[number];

  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsString()
  receivingNo?: string;

  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsString()
  disbursementNo?: string;

  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsString()
  @Matches(POSITIVE_DECIMAL_ID, { message: 'supplierId must be a valid id' })
  supplierId?: string;

  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsString()
  @Matches(POSITIVE_DECIMAL_ID, { message: 'departmentId must be a valid id' })
  departmentId?: string;

  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsString()
  productionOrder?: string;

  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsString()
  referenceNo?: string;

  /** Created-by / operator — matched against the user's username. */
  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsString()
  operator?: string;

  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsIn(TRACEABILITY_STATUSES)
  status?: string;
}
