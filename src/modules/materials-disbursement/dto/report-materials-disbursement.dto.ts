import {
  IsOptional,
  IsDateString,
  IsIn,
} from 'class-validator';
import { DISBURSEMENT_STATUSES, DISBURSEMENT_TYPES } from '../materials-disbursement.entity';

export class ReportMaterialsDisbursementQueryDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsIn(DISBURSEMENT_STATUSES)
  status?: string;

  @IsOptional()
  @IsIn(DISBURSEMENT_TYPES)
  disbursementType?: string;
}

/** Row shape สำหรับรายงานจ่ายออก (สอบกลับ) */
export interface ReportMaterialsDisbursementRow {
  id: string;
  disbursementNo: string;
  disbursementDate: string;
  /** ประเภท: stock_cut = ตัดสต็อก, production = เบิกเพื่อผลิต */
  disbursementType: string;
  disbursementTypeLabel: string;
  reason: string | null;
  /** รายละเอียดวัสดุ */
  materialCode: string;
  materialName: string;
  materialType: string | null;
  requestedQuantity: string;
  disbursedQuantity: string;
  unitSymbol: string;
  status: string;
  statusLabel: string;
  /** lot ต้นทางที่ถูกหัด FIFO */
  sourceLotNo: string | null;
  confirmedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  createdBy: string | null;
  createdAt: string;
}
