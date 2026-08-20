import { Type } from 'class-transformer';
import {
  IsOptional,
  IsDateString,
  IsIn,
  IsNumberString,
  IsString,
} from 'class-validator';
import { MATERIAL_RECEIVING_STATUSES } from '../../../entities/inventory/material-receiving.entity';

export class ReportMaterialsReceivingQueryDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsIn(MATERIAL_RECEIVING_STATUSES)
  status?: string;

  @IsOptional()
  @IsNumberString()
  supplierId?: string;

  @IsOptional()
  @IsNumberString()
  materialId?: string;

  @IsOptional()
  @IsNumberString()
  organizationId?: string;
}

/** Row shape สำหรับรายงานรับเข้า (สอบกลับ) */
export interface ReportMaterialsReceivingRow {
  id: string;
  runNo: string | null;
  internalLotNo: string;
  receiveDate: string;
  supplierProductionDate: string | null;
  /** ชื่อผู้จัดจำหน่าย */
  supplierCode: string;
  supplierName: string;
  /** รหัสและชื่อวัสดุ */
  materialCode: string;
  materialName: string;
  materialType: string | null;
  receiveQuantity: string;
  unitSymbol: string;
  packingQuantity: number;
  packageCount: number;
  /** เลขที่ PO */
  poNo: string | null;
  status: string;
  organizationName: string;
  confirmedAt: string | null;
  createdBy: string | null;
  createdAt: string;
}
