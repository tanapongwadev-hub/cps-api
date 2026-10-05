import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  PrimaryGeneratedColumn,
} from 'typeorm';

export const PRODUCTION_TRANSACTION_TYPES = [
  'PLAN_RELEASE',
  'PROCESS_IN',
  'PROCESS_OUTPUT',
  'REJECT',
  'TRANSFER',
  'SPLIT',
  'MERGE',
  'FG_RECEIVE',
  'PACKING',
  'SHORT_CLOSE',
  'ADJUSTMENT',
  'REVERSAL',
] as const;
export type ProductionTransactionType =
  (typeof PRODUCTION_TRANSACTION_TYPES)[number];

export type AllocationMode = 'FIFO' | 'MANUAL';

/**
 * Append-only ledger of every quantity movement (DB triggers forbid UPDATE
 * and DELETE). `qty` is negative only for ADJUSTMENT/REVERSAL. Idempotency:
 * the same `requestId` cannot write the same movement twice.
 */
@Entity('production_transactions', { schema: 'inventory' })
export class ProductionTransaction {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'request_id', type: 'uuid' })
  requestId: string;

  @Column({ name: 'production_order_id', type: 'bigint' })
  productionOrderId: string;

  @Column({ name: 'production_order_line_id', type: 'bigint' })
  productionOrderLineId: string;

  @Column({ name: 'step_index', type: 'integer' })
  stepIndex: number;

  @Column({ name: 'process_step_id', type: 'bigint' })
  processStepId: string;

  @Column({ name: 'transaction_type', type: 'varchar', length: 20 })
  transactionType: ProductionTransactionType;

  @Column({ name: 'source_lot_id', type: 'bigint', nullable: true })
  sourceLotId: string | null;

  @Column({ name: 'target_lot_id', type: 'bigint', nullable: true })
  targetLotId: string | null;

  @Column({ name: 'source_wip_id', type: 'bigint', nullable: true })
  sourceWipId: string | null;

  @Column({ name: 'target_wip_id', type: 'bigint', nullable: true })
  targetWipId: string | null;

  @Column({ name: 'package_id', type: 'bigint', nullable: true })
  packageId: string | null;

  @Column({ type: 'integer' })
  qty: number;

  @Column({ name: 'reject_reason_id', type: 'bigint', nullable: true })
  rejectReasonId: string | null;

  /** Production day (shift-based), YYYY-MM-DD. */
  @Column({ name: 'transaction_date', type: 'date' })
  transactionDate: string;

  @Column({ name: 'shift_key', type: 'varchar', length: 20, default: '' })
  shiftKey: string;

  @Column({
    name: 'allocation_mode',
    type: 'varchar',
    length: 10,
    nullable: true,
  })
  allocationMode: AllocationMode | null;

  @Column({ name: 'reverses_transaction_id', type: 'bigint', nullable: true })
  reversesTransactionId: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  remark: string | null;

  @Column({ name: 'operator_id', type: 'bigint', nullable: true })
  operatorId: string | null;

  @Column({
    name: 'correlation_id',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  correlationId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

/** Origin breakdown of one ledger movement. Immutable. */
@Entity('production_transaction_origins', { schema: 'inventory' })
export class ProductionTransactionOrigin {
  @PrimaryColumn({ name: 'transaction_id', type: 'bigint' })
  transactionId: string;

  @PrimaryColumn({ name: 'origin_lot_id', type: 'bigint' })
  originLotId: string;

  @Column({ type: 'integer' })
  qty: number;
}
