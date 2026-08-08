import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { GoodsReceiptAttachmentInputDto } from './create-goods-receipt.dto';
import { GOODS_RECEIPT_ATTACHMENT_MAX_COUNT } from '../goods-receipt-attachment-storage.service';

export class AddGoodsReceiptAttachmentsDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(GOODS_RECEIPT_ATTACHMENT_MAX_COUNT)
  @ValidateNested({ each: true })
  @Type(() => GoodsReceiptAttachmentInputDto)
  attachments: GoodsReceiptAttachmentInputDto[];
}
