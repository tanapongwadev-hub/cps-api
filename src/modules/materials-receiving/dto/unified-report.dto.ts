import { IsOptional, IsDateString, IsIn } from 'class-validator';

/** Shared filters for the unified materials report */
export class UnifiedReportQueryDto {
  @IsOptional()
  @IsIn(['today', 'this_month', 'this_year', 'custom'])
  period?: 'today' | 'this_month' | 'this_year' | 'custom';

  /** Custom date range (used when period=custom or not set) */
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsDateString()
  startDateDisbursement?: string;

  @IsOptional()
  @IsDateString()
  endDateDisbursement?: string;

  @IsOptional()
  @IsIn(['receive', 'disbursement', 'both'])
  type?: 'receive' | 'disbursement' | 'both';

  @IsOptional()
  @IsDateString()
  materialId?: string;
}

/** Union row — represents either a receiving or disbursement transaction */
export interface UnifiedReportRow {
  /** 'receive' | 'disbursement' */
  docType: 'receive' | 'disbursement';
  docDate: string;
  docNo: string;
  materialCode: string;
  materialName: string;
  materialType: string | null;
  unitSymbol: string;
  quantityIn: string | null;
  quantityOut: string | null;
  /** สำหรับ receive: วันผลิต supplier / สำหรับ disbursement: ประเภทจ่าย */
  subLabel: string | null;
  /** สำหรับ disbursement: lot ต้นทาง (FIFO) */
  sourceLotNo: string | null;
  poNo: string | null;
  supplierName: string | null;
  status: string;
  statusLabel: string;
}
