import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';
import { GOODS_RECEIPT_ITEM_MAX_COUNT } from './create-goods-receipt.dto';
import { GoodsReceiptItemDto } from './goods-receipt-item.dto';
import {
  ISO_DATE,
  POSITIVE_DECIMAL_ID,
  nullableTrimmedString,
  trimString,
} from './transforms';

export class UpdateGoodsReceiptDto {
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @Matches(POSITIVE_DECIMAL_ID, { message: 'supplierId must be a valid id' })
  supplierId?: string;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @Matches(ISO_DATE, { message: 'receiptDate must be in YYYY-MM-DD format' })
  receiptDate?: string;

  @Transform(nullableTrimmedString)
  @IsOptional()
  @IsString()
  remark?: string | null;

  /** ถ้าส่งมา จะแทนที่บรรทัดทั้งชุด */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(GOODS_RECEIPT_ITEM_MAX_COUNT)
  @ValidateNested({ each: true })
  @Type(() => GoodsReceiptItemDto)
  items?: GoodsReceiptItemDto[];

  @IsOptional()
  @IsISO8601({ strict: true })
  updatedAt?: string;
}
