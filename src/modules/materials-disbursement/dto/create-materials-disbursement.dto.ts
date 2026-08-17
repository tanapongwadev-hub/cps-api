import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class DisbursementItemDto {
  @IsNotEmpty()
  @IsString()
  materialId: string;

  @IsNotEmpty()
  @IsString()
  requestedQuantity: string;
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
  attachmentUrl?: string;

  @IsOptional()
  @IsString()
  attachmentName?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DisbursementItemDto)
  items: DisbursementItemDto[];

  @IsOptional()
  @IsString()
  remark?: string;
}
