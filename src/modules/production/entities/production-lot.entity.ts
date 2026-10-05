import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ProcessStep } from '../../../entities/master/process-step.entity';
import {
  ProductionOrder,
  ProductionOrderLine,
} from '../../production-orders/production-order.entity';

export const LOT_TYPES = ['ORIGIN', 'PROCESS', 'FG', 'STORE'] as const;
export type LotType = (typeof LOT_TYPES)[number];
export const LOT_STATUSES = ['OPEN', 'CONSUMED', 'REVERSED'] as const;
export type LotStatus = (typeof LOT_STATUSES)[number];

/**
 * A production lot at one workflow step: ORIGIN at the first step, PROCESS in
 * between, FG/STORE at a receiving step. One lot per order line / step /
 * production date / shift while `outputClosedAt` is null; more output in the
 * same shift is added to it. `remainingQty` = produced but not yet
 * transferred (or packed, for FG/STORE).
 * See docs/plans/2026-10-05-production-lot-traceability-plan.md (admin-dashboard).
 */
@Entity('production_lots', { schema: 'inventory' })
export class ProductionLot {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  /** e.g. WE-691001-001 (process code, B.E. YYMMDD, daily sequence). */
  @Index({ unique: true })
  @Column({ name: 'lot_no', type: 'varchar', length: 60 })
  lotNo: string;

  @Column({ name: 'production_order_id', type: 'bigint' })
  productionOrderId: string;

  @Column({ name: 'production_order_line_id', type: 'bigint' })
  productionOrderLineId: string;

  @Column({ name: 'product_id', type: 'bigint' })
  productId: string;

  /** 0-based index into the line's pinned workflow steps. */
  @Column({ name: 'step_index', type: 'integer' })
  stepIndex: number;

  @Column({ name: 'process_step_id', type: 'bigint' })
  processStepId: string;

  /** Snapshot of the process step code when the lot was made. */
  @Column({ name: 'process_code', type: 'varchar', length: 50 })
  processCode: string;

  @Column({ name: 'lot_type', type: 'varchar', length: 10 })
  lotType: LotType;

  @Column({ name: 'produced_qty', type: 'integer' })
  producedQty: number;

  @Column({ name: 'remaining_qty', type: 'integer' })
  remainingQty: number;

  /** Production day (shift-based), YYYY-MM-DD. */
  @Column({ name: 'production_date', type: 'date' })
  productionDate: string;

  /** '' when no shift was given. */
  @Column({ name: 'shift_key', type: 'varchar', length: 20, default: '' })
  shiftKey: string;

  @Column({ type: 'varchar', length: 12, default: 'OPEN' })
  status: LotStatus;

  /** Set when the shift ends — the lot no longer accepts new output. */
  @Column({ name: 'output_closed_at', type: 'timestamptz', nullable: true })
  outputClosedAt: Date | null;

  @Column({ name: 'created_by', type: 'bigint', nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => ProductionOrder)
  @JoinColumn({ name: 'production_order_id' })
  order: ProductionOrder;

  @ManyToOne(() => ProductionOrderLine)
  @JoinColumn({ name: 'production_order_line_id' })
  line: ProductionOrderLine;

  @ManyToOne(() => ProcessStep)
  @JoinColumn({ name: 'process_step_id' })
  processStep: ProcessStep;
}

/** Lineage edge (many-to-many): `qty` of `sourceLot` went into `targetLot`. Immutable. */
@Entity('production_lot_sources', { schema: 'inventory' })
export class ProductionLotSource {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Index()
  @Column({ name: 'target_lot_id', type: 'bigint' })
  targetLotId: string;

  @Index()
  @Column({ name: 'source_lot_id', type: 'bigint' })
  sourceLotId: string;

  @Column({ type: 'integer' })
  qty: number;

  @Column({ name: 'transaction_id', type: 'bigint' })
  transactionId: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => ProductionLot)
  @JoinColumn({ name: 'target_lot_id' })
  targetLot: ProductionLot;

  @ManyToOne(() => ProductionLot)
  @JoinColumn({ name: 'source_lot_id' })
  sourceLot: ProductionLot;
}

/**
 * Materialized origin composition of a lot: `qty` pieces from origin lot
 * `originLotId` (an ORIGIN lot; an ORIGIN lot lists itself), of which
 * `qtyRemaining` are still in this lot.
 */
@Entity('production_lot_origins', { schema: 'inventory' })
export class ProductionLotOrigin {
  @PrimaryColumn({ name: 'lot_id', type: 'bigint' })
  lotId: string;

  @PrimaryColumn({ name: 'origin_lot_id', type: 'bigint' })
  originLotId: string;

  @Column({ type: 'integer' })
  qty: number;

  @Column({ name: 'qty_remaining', type: 'integer' })
  qtyRemaining: number;

  @ManyToOne(() => ProductionLot)
  @JoinColumn({ name: 'origin_lot_id' })
  originLot: ProductionLot;
}

/** Daily lot-number sequence per prefix (process code). */
@Entity('production_lot_counters', { schema: 'inventory' })
export class ProductionLotCounter {
  @PrimaryColumn({ type: 'varchar', length: 20 })
  prefix: string;

  @PrimaryColumn({ name: 'lot_date', type: 'date' })
  lotDate: string;

  @Column({ name: 'last_seq', type: 'integer' })
  lastSeq: number;
}
