import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Material } from '../master/material.entity';

export const STOCK_TRANSACTION_TYPES = [
  'RECEIVE',
  'ISSUE',
  'RETURN',
  'ADJUST_IN',
  'ADJUST_OUT',
  'TRANSFER_IN',
  'TRANSFER_OUT',
  'CANCEL',
] as const;
export type StockTransactionType = (typeof STOCK_TRANSACTION_TYPES)[number];

export const STOCK_TRANSACTION_REFERENCE_TYPES = [
  'MATERIAL_RECEIVING',
  'MATERIALS_DISBURSEMENT',
] as const;
export type StockTransactionReferenceType =
  (typeof STOCK_TRANSACTION_REFERENCE_TYPES)[number];

@Entity('stock_transactions', { schema: 'inventory' })
export class StockTransaction {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Index({ unique: true })
  @Column({ name: 'transaction_no', type: 'varchar', length: 50 })
  transactionNo: string;

  @Index()
  @Column({ name: 'trace_id', type: 'varchar', length: 40 })
  traceId: string;

  @Index()
  @Column({ name: 'material_id', type: 'bigint' })
  materialId: string;

  @Column({ name: 'transaction_type', type: 'varchar', length: 20 })
  transactionType: StockTransactionType;

  @Column({ name: 'reference_type', type: 'varchar', length: 30 })
  referenceType: StockTransactionReferenceType;

  @Column({ name: 'reference_id', type: 'bigint', nullable: true })
  referenceId: string | null;

  @Column({
    name: 'reference_lot_no',
    type: 'varchar',
    length: 30,
    nullable: true,
  })
  referenceLotNo: string | null;

  @Index()
  @Column({ name: 'main_qr_id', type: 'bigint', nullable: true })
  mainQrId: string | null;

  @Index()
  @Column({ name: 'sub_qr_id', type: 'bigint', nullable: true })
  subQrId: string | null;

  @Column({ name: 'unit_id', type: 'bigint', nullable: true })
  unitId: string | null;

  @Column({ name: 'department_id', type: 'bigint', nullable: true })
  departmentId: string | null;

  @Column({
    name: 'production_order',
    type: 'varchar',
    length: 80,
    nullable: true,
  })
  productionOrder: string | null;

  @Column({ name: 'reference_no', type: 'varchar', length: 80, nullable: true })
  referenceNo: string | null;

  @Column({ name: 'source_location_id', type: 'bigint', nullable: true })
  sourceLocationId: string | null;

  @Column({ name: 'destination_location_id', type: 'bigint', nullable: true })
  destinationLocationId: string | null;

  @Column({
    name: 'quantity_before',
    type: 'numeric',
    precision: 18,
    scale: 4,
  })
  quantityBefore: string;

  @Column({
    name: 'quantity_in',
    type: 'numeric',
    precision: 18,
    scale: 4,
    default: 0,
  })
  quantityIn: string;

  @Column({
    name: 'quantity_out',
    type: 'numeric',
    precision: 18,
    scale: 4,
    default: 0,
  })
  quantityOut: string;

  @Column({
    name: 'quantity_after',
    type: 'numeric',
    precision: 18,
    scale: 4,
  })
  quantityAfter: string;

  @Index()
  @Column({
    name: 'transaction_date',
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
  })
  transactionDate: Date;

  @Column({ type: 'text', nullable: true })
  remark: string | null;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ name: 'created_by', type: 'bigint', nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @ManyToOne(() => Material, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'material_id' })
  material: Material;
}
