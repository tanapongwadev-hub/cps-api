import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';

export class DisbursementItemDto {
  @IsNotEmpty()
  @IsString()
  materialId: string;

  @IsNotEmpty()
  @IsString()
  requestedQuantity: string;

  /** เหตุผลรายการ (stock_cut) — ตัวเลือก หรือ "อื่นๆ" */
  @IsOptional()
  @IsString()
  reason?: string;

  /** ข้อความเหตุผล — จำเป็นเมื่อ reason = "อื่นๆ" */
  @IsOptional()
  @IsString()
  reasonNote?: string;
}

export class DisbursementAttachmentDto {
  @IsNotEmpty()
  @IsString()
  url: string;

  @IsNotEmpty()
  @IsString()
  name: string;
}

export class CreateMaterialsDisbursementDto {
  @IsNotEmpty()
  @IsIn(['stock_cut', 'production'])
  disbursementType: 'stock_cut' | 'production';

  @IsNotEmpty()
  @IsDateString()
  disbursementDate: string;

  /** เหตุผลการตัด — ต้องระบุเมื่อ disbursementType = 'stock_cut' */
  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  departmentId?: string;

  @IsOptional()
  @IsString()
  productionOrder?: string;

  @IsOptional()
  @IsString()
  referenceNo?: string;

  @IsOptional()
  @IsString()
  requestedBy?: string;

  /** รายการแจ้งปัญหา (id) — จำเป็นเมื่อเป็น stock_cut */
  @IsOptional()
  @Matches(/^[1-9]d*$/)
  issueReportId?: string;

  @IsOptional()
  @IsString()
  attachmentUrl?: string;

  @IsOptional()
  @IsString()
  attachmentName?: string;

  /** ไฟล์แนบหลายไฟล์ (สูงสุด 10) — ถ้าส่งมาจะใช้แทน attachmentUrl/attachmentName */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => DisbursementAttachmentDto)
  attachments?: DisbursementAttachmentDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DisbursementItemDto)
  items: DisbursementItemDto[];

  @IsOptional()
  @IsString()
  remark?: string;
}
