import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { GoodsReceipt } from './goods-receipt.entity';

export const GOODS_RECEIPT_DOC_TYPES = [
  'DELIVERY_NOTE',
  'TAX_INVOICE',
  'PHOTO',
  'OTHER',
] as const;

export type GoodsReceiptDocType = (typeof GOODS_RECEIPT_DOC_TYPES)[number];

@Entity('goods_receipt_attachments', { schema: 'inventory' })
export class GoodsReceiptAttachment {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Index()
  @Column({ name: 'goods_receipt_id', type: 'bigint' })
  goodsReceiptId: string;

  @Column({ name: 'doc_type', type: 'varchar', length: 30 })
  docType: GoodsReceiptDocType;

  @Column({ name: 'file_path', type: 'varchar', length: 500 })
  filePath: string;

  @Column({ name: 'file_name', type: 'varchar', length: 255 })
  fileName: string;

  @Column({ name: 'mime_type', type: 'varchar', length: 100 })
  mimeType: string;

  @Column({ name: 'file_size', type: 'integer' })
  fileSize: number;

  @Column({ name: 'created_by', type: 'bigint', nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @ManyToOne(() => GoodsReceipt, (goodsReceipt) => goodsReceipt.attachments, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'goods_receipt_id' })
  goodsReceipt: GoodsReceipt;
}
