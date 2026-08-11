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

export const STOCK_TRANSACTION_TYPES = ['RECEIVE', 'ISSUE', 'ADJUST'] as const;
export type StockTransactionType = (typeof STOCK_TRANSACTION_TYPES)[number];

export const STOCK_TRANSACTION_REFERENCE_TYPES = [
  'MATERIAL_RECEIVING',
] as const;
export type StockTransactionReferenceType =
  (typeof STOCK_TRANSACTION_REFERENCE_TYPES)[number];

@Entity('stock_transactions', { schema: 'inventory' })
export class StockTransaction {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

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

  @Column({ name: 'created_by', type: 'bigint', nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @ManyToOne(() => Material, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'material_id' })
  material: Material;
}
