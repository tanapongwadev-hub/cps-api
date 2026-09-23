import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ProductionPlan } from '../production-plans/production-plan.entity';

export const MATERIAL_JOB_ORDER_STATUSES = [
  'WAITING_PICKING',
  'READY_TO_ISSUE',
  'PARTIALLY_ISSUED',
  'ISSUED',
  'CANCELLED',
] as const;
export type MaterialJobOrderStatus =
  (typeof MATERIAL_JOB_ORDER_STATUSES)[number];

/**
 * ใบจัดงาน (Job Order) — the warehouse-facing document created the moment a
 * Production Plan is APPROVED (one Job Order per Plan). It tells warehouse
 * staff which packages/QR/boxes to pick for which Plan, and owns the actual
 * stock cut ("จ่ายออก") that used to live on ProductionPlansService#issue —
 * see docs/plans/2026-09-23-production-job-order-material-issue-plan.md.
 *
 * A Job Order never introduces its own reservation ledger: its pick lines
 * *are* the Plan's own `production_plan_reservations` rows (see that
 * entity's `issuedQuantity`/`pickedAt` columns).
 */
@Entity('material_job_orders', { schema: 'inventory' })
export class MaterialJobOrder {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 20 })
  code: string;

  @Index({ unique: true })
  @Column({ name: 'production_plan_id', type: 'bigint' })
  productionPlanId: string;

  @Index()
  @Column({ type: 'varchar', length: 20, default: 'WAITING_PICKING' })
  status: MaterialJobOrderStatus;

  /** Optimistic-concurrency guard for pick/issue idempotency. */
  @Column({ type: 'integer', default: 1 })
  version: number;

  @Column({ name: 'print_count', type: 'integer', default: 0 })
  printCount: number;

  @Column({ name: 'last_printed_by', type: 'bigint', nullable: true })
  lastPrintedBy: string | null;

  @Column({ name: 'last_printed_at', type: 'timestamp', nullable: true })
  lastPrintedAt: Date | null;

  @Column({ name: 'completed_by', type: 'bigint', nullable: true })
  completedBy: string | null;

  @Column({ name: 'completed_at', type: 'timestamp', nullable: true })
  completedAt: Date | null;

  @Column({ name: 'cancelled_by', type: 'bigint', nullable: true })
  cancelledBy: string | null;

  @Column({ name: 'cancelled_at', type: 'timestamp', nullable: true })
  cancelledAt: Date | null;

  @Column({
    name: 'cancel_reason',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  cancelReason: string | null;

  @Column({ name: 'created_by', type: 'bigint', nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;

  @OneToOne(() => ProductionPlan)
  @JoinColumn({ name: 'production_plan_id' })
  productionPlan: ProductionPlan;
}
