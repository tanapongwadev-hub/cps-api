import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Material } from '../master/material.entity';
import { RejectReason } from '../master/reject-reason.entity';
import { Unit } from '../master/unit.entity';
import { GoodsReceipt } from './goods-receipt.entity';

@Entity('goods_receipt_items', { schema: 'inventory' })
@Index(['goodsReceiptId', 'lineNo'], { unique: true })
export class GoodsReceiptItem {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Index()
  @Column({ name: 'goods_receipt_id', type: 'bigint' })
  goodsReceiptId: string;

  @Column({ name: 'line_no', type: 'integer' })
  lineNo: number;

  @Column({ name: 'po_no', type: 'varchar', length: 50, nullable: true })
  poNo: string | null;

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

  @Column({ name: 'file_path', type: 'varchar', length: 500, nullable: true })
  filePath: string | null;

  @Column({ name: 'file_name', type: 'varchar', length: 255, nullable: true })
  fileName: string | null;

  @Index()
  @Column({ name: 'material_id', type: 'bigint' })
  materialId: string;

  @Column({
    name: 'material_code',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  materialCode: string | null;

  @Column({
    name: 'material_name',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  materialName: string | null;

  @Column({ name: 'unit_id', type: 'bigint' })
  unitId: string;

  @Column({
    name: 'qty_delivered',
    type: 'numeric',
    precision: 18,
    scale: 4,
  })
  qtyDelivered: string;

  @Column({ name: 'qty_received', type: 'numeric', precision: 18, scale: 4 })
  qtyReceived: string;

  @Column({
    name: 'qty_rejected',
    type: 'numeric',
    precision: 18,
    scale: 4,
    default: 0,
  })
  qtyRejected: string;

  @Column({ name: 'reject_reason_id', type: 'bigint', nullable: true })
  rejectReasonId: string | null;

  @Column({ name: 'reject_note', type: 'text', nullable: true })
  rejectNote: string | null;

  @Column({ name: 'lot_no', type: 'varchar', length: 50, nullable: true })
  lotNo: string | null;

  @Column({ name: 'production_date', type: 'date', nullable: true })
  productionDate: string | null;

  @Column({ name: 'expiry_date', type: 'date', nullable: true })
  expiryDate: string | null;

  @Column({
    name: 'unit_price',
    type: 'numeric',
    precision: 18,
    scale: 4,
    nullable: true,
  })
  unitPrice: string | null;

  @Column({
    name: 'line_amount',
    type: 'numeric',
    precision: 18,
    scale: 4,
    nullable: true,
  })
  lineAmount: string | null;

  @Column({ type: 'text', nullable: true })
  remark: string | null;

  @Column({ name: 'created_by', type: 'bigint', nullable: true })
  createdBy: string | null;

  @Column({ name: 'updated_by', type: 'bigint', nullable: true })
  updatedBy: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;

  @ManyToOne(() => GoodsReceipt, (goodsReceipt) => goodsReceipt.items, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'goods_receipt_id' })
  goodsReceipt: GoodsReceipt;

  @ManyToOne(() => Material, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'material_id' })
  material: Material;

  @ManyToOne(() => Unit, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'unit_id' })
  unit: Unit;

  @ManyToOne(() => RejectReason, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'reject_reason_id' })
  rejectReason: RejectReason | null;
}
