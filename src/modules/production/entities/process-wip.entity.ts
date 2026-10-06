import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ProductionLot } from './production-lot.entity';

export const WIP_STATUSES = ['OPEN', 'DONE'] as const;
export type WipStatus = (typeof WIP_STATUSES)[number];

/**
 * Quantity waiting to be produced at one workflow step, one row per source
 * lot transferred in (`sourceLotId` null = the plan quantity released to the
 * first step). FIFO order = `receivedAt, id`.
 * Invariant (DB CHECK): qtyRemaining = qtyIn - qtyUsed - qtyRejected - qtyClosed.
 */
@Entity('process_wip', { schema: 'inventory' })
export class ProcessWip {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'production_order_id', type: 'bigint' })
  productionOrderId: string;

  @Column({ name: 'production_order_line_id', type: 'bigint' })
  productionOrderLineId: string;

  @Column({ name: 'step_index', type: 'integer' })
  stepIndex: number;

  @Column({ name: 'process_step_id', type: 'bigint' })
  processStepId: string;

  @Column({ name: 'source_lot_id', type: 'bigint', nullable: true })
  sourceLotId: string | null;

  @Column({ name: 'qty_in', type: 'integer' })
  qtyIn: number;

  @Column({ name: 'qty_used', type: 'integer', default: 0 })
  qtyUsed: number;

  @Column({ name: 'qty_rejected', type: 'integer', default: 0 })
  qtyRejected: number;

  /** Closed short (not produced). */
  @Column({ name: 'qty_closed', type: 'integer', default: 0 })
  qtyClosed: number;

  @Column({ name: 'qty_remaining', type: 'integer' })
  qtyRemaining: number;

  @Column({ name: 'received_at', type: 'timestamptz' })
  receivedAt: Date;

  /** Transfer tag TQ-{source lot}-S{step}-{nn} (null for the plan release). */
  @Column({ name: 'qr_code', type: 'varchar', length: 80, nullable: true })
  qrCode: string | null;

  @Column({ type: 'varchar', length: 10, default: 'OPEN' })
  status: WipStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => ProductionLot)
  @JoinColumn({ name: 'source_lot_id' })
  sourceLot: ProductionLot | null;
}

/** Origin composition of a WIP row (empty for the plan row at the first step). */
@Entity('process_wip_origins', { schema: 'inventory' })
export class ProcessWipOrigin {
  @PrimaryColumn({ name: 'wip_id', type: 'bigint' })
  wipId: string;

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
