import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { GOODS_RECEIPT_DOC_TYPES } from '../../../entities/inventory/goods-receipt-attachment.entity';
import { GoodsReceiptItemDto } from './goods-receipt-item.dto';
import {
  ISO_DATE,
  POSITIVE_DECIMAL_ID,
  nullableTrimmedString,
  trimString,
} from './transforms';

export const GOODS_RECEIPT_ITEM_MAX_COUNT = 200;

export class GoodsReceiptAttachmentInputDto {
  @Transform(trimString)
  @IsString()
  @IsIn(GOODS_RECEIPT_DOC_TYPES)
  docType: (typeof GOODS_RECEIPT_DOC_TYPES)[number];

  @Transform(trimString)
  @IsString()
  @MaxLength(500)
  filePath: string;

  @Transform(trimString)
  @IsString()
  @MaxLength(255)
  fileName: string;
}

export class CreateGoodsReceiptDto {
  @Transform(trimString)
  @IsString()
  @Matches(POSITIVE_DECIMAL_ID, { message: 'supplierId must be a valid id' })
  supplierId: string;

  @Transform(trimString)
  @IsString()
  @Matches(ISO_DATE, { message: 'receiptDate must be in YYYY-MM-DD format' })
  receiptDate: string;

  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsString()
  remark?: string | null;

  @IsArray()
  @ArrayMaxSize(GOODS_RECEIPT_ITEM_MAX_COUNT)
  @ValidateNested({ each: true })
  @Type(() => GoodsReceiptItemDto)
  items: GoodsReceiptItemDto[] = [];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => GoodsReceiptAttachmentInputDto)
  attachments?: GoodsReceiptAttachmentInputDto[];
}
