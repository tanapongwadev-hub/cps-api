import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Organization } from '../master/organization.entity';
import { Supplier } from '../master/supplier.entity';
import { GoodsReceiptAttachment } from './goods-receipt-attachment.entity';
import { GoodsReceiptItem } from './goods-receipt-item.entity';

export const GOODS_RECEIPT_STATUSES = ['draft', 'posted', 'cancelled'] as const;

export type GoodsReceiptStatus = (typeof GOODS_RECEIPT_STATUSES)[number];

@Entity('goods_receipts', { schema: 'inventory' })
export class GoodsReceipt {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'receipt_no', type: 'varchar', length: 30, nullable: true })
  receiptNo: string | null;

  @Index()
  @Column({ name: 'organization_id', type: 'bigint' })
  organizationId: string;

  @Index()
  @Column({ name: 'supplier_id', type: 'bigint' })
  supplierId: string;

  @Index()
  @Column({ name: 'receipt_date', type: 'date' })
  receiptDate: string;

  @Column({
    name: 'supplier_doc_no',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  supplierDocNo: string | null;

  @Column({ name: 'supplier_doc_date', type: 'date', nullable: true })
  supplierDocDate: string | null;

  @Column({ name: 'no_supplier_document', type: 'boolean', default: false })
  noSupplierDocument: boolean;

  @Index()
  @Column({ type: 'varchar', length: 20, default: 'draft' })
  status: GoodsReceiptStatus;

  @Column({ type: 'text', nullable: true })
  remark: string | null;

  @Column({ name: 'posted_by', type: 'bigint', nullable: true })
  postedBy: string | null;

  @Column({ name: 'posted_at', type: 'timestamp', nullable: true })
  postedAt: Date | null;

  @Column({ name: 'cancelled_by', type: 'bigint', nullable: true })
  cancelledBy: string | null;

  @Column({ name: 'cancelled_at', type: 'timestamp', nullable: true })
  cancelledAt: Date | null;

  @Column({ name: 'cancel_reason', type: 'text', nullable: true })
  cancelReason: string | null;

  @Column({ name: 'created_by', type: 'bigint', nullable: true })
  createdBy: string | null;

  @Column({ name: 'updated_by', type: 'bigint', nullable: true })
  updatedBy: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;

  @ManyToOne(() => Organization, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @ManyToOne(() => Supplier, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'supplier_id' })
  supplier: Supplier;

  @OneToMany(() => GoodsReceiptItem, (item) => item.goodsReceipt, {
    cascade: false,
  })
  items: GoodsReceiptItem[];

  @OneToMany(
    () => GoodsReceiptAttachment,
    (attachment) => attachment.goodsReceipt,
    { cascade: false },
  )
  attachments: GoodsReceiptAttachment[];
}
