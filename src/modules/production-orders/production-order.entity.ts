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
import { Product } from '../../entities/master/product.entity';
import { ProductWorkflow } from '../../entities/master/product-workflow.entity';
import { ProductionPlan } from '../production-plans/production-plan.entity';

export const PRODUCTION_ORDER_STATUSES = ['IN_PROGRESS', 'COMPLETED'] as const;
export type ProductionOrderStatus = (typeof PRODUCTION_ORDER_STATUSES)[number];
export type PacketUnitType = 'FULL' | 'PARTIAL';

/**
 * ใบสั่งผลิต — created from a Production Plan whose Job Order has been fully
 * issued. Packets (boxes) with their QR are created only when the first
 * workflow step reports real output (see ProductionOrderOutput); each box
 * then walks through the product ACTIVE workflow steps (pinned on the line
 * at order time). Unproduced quantity stays on hold at the first step.
 */
@Entity('production_orders', { schema: 'inventory' })
export class ProductionOrder {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 20 })
  code: string;

  /** Exactly one order per plan. */
  @Index({ unique: true })
  @Column({ name: 'production_plan_id', type: 'bigint' })
  productionPlanId: string;

  @Index()
  @Column({ type: 'varchar', length: 20, default: 'IN_PROGRESS' })
  status: ProductionOrderStatus;

  @Column({ name: 'completed_at', type: 'timestamp', nullable: true })
  completedAt: Date | null;

  /**
   * PACKET = legacy per-step boxes (production_order_packets);
   * LOT = lot traceability model (modules/production).
   */
  @Column({
    name: 'tracking_model',
    type: 'varchar',
    length: 10,
    default: 'PACKET',
  })
  trackingModel: 'PACKET' | 'LOT';

  @Column({ name: 'created_by', type: 'bigint', nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;

  @ManyToOne(() => ProductionPlan)
  @JoinColumn({ name: 'production_plan_id' })
  productionPlan: ProductionPlan;

  @OneToMany(() => ProductionOrderLine, (line) => line.order)
  lines: ProductionOrderLine[];
}

@Entity('production_order_lines', { schema: 'inventory' })
export class ProductionOrderLine {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Index()
  @Column({ name: 'production_order_id', type: 'bigint' })
  productionOrderId: string;

  @Column({ name: 'line_no', type: 'integer' })
  lineNo: number;

  @Column({ name: 'product_id', type: 'bigint' })
  productId: string;

  /** The product ACTIVE workflow at the moment the order was created. */
  @Column({ name: 'workflow_id', type: 'bigint' })
  workflowId: string;

  @Column({ type: 'integer' })
  quantity: number;

  @Column({ name: 'packing_quantity', type: 'integer' })
  packingQuantity: number;

  /** LOT model cached counters (kept in the same transaction as the ledger). */
  @Column({ name: 'produced_qty', type: 'integer', default: 0 })
  producedQty: number;

  @Column({ name: 'received_qty', type: 'integer', default: 0 })
  receivedQty: number;

  @Column({ name: 'rejected_qty', type: 'integer', default: 0 })
  rejectedQty: number;

  /** Plan quantity closed without being produced ("ปิดยอดค้าง"). */
  @Column({ name: 'short_closed_quantity', type: 'integer', default: 0 })
  shortClosedQuantity: number;

  @Column({
    name: 'short_close_reason',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  shortCloseReason: string | null;

  @Column({ name: 'short_closed_at', type: 'timestamp', nullable: true })
  shortClosedAt: Date | null;

  @Column({ name: 'short_closed_by', type: 'bigint', nullable: true })
  shortClosedBy: string | null;

  @ManyToOne(() => ProductionOrder, (order) => order.lines, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'production_order_id' })
  order: ProductionOrder;

  @ManyToOne(() => Product)
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @ManyToOne(() => ProductWorkflow)
  @JoinColumn({ name: 'workflow_id' })
  workflow: ProductWorkflow;

  @OneToMany(() => ProductionOrderPacket, (packet) => packet.line)
  packets: ProductionOrderPacket[];
}

@Entity('production_order_packets', { schema: 'inventory' })
export class ProductionOrderPacket {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Index()
  @Column({ name: 'production_order_line_id', type: 'bigint' })
  productionOrderLineId: string;

  @Column({ name: 'packet_no', type: 'integer' })
  packetNo: number;

  /** Content encoded in the packet QR image — globally unique. */
  @Index({ unique: true })
  @Column({ name: 'qr_code', type: 'varchar', length: 60 })
  qrCode: string;

  @Column({ type: 'integer' })
  quantity: number;

  /** FULL = packing quantity; PARTIAL = the remainder box of an output. */
  @Column({ name: 'unit_type', type: 'varchar', length: 10, default: 'FULL' })
  unitType: PacketUnitType;

  /** The output report that created this box (null = legacy pre-created). */
  @Column({
    name: 'production_order_output_id',
    type: 'bigint',
    nullable: true,
  })
  productionOrderOutputId: string | null;

  /**
   * Set when this box was split off another box at a downstream step (only
   * part of it was produced there); the parent keeps the remainder on hold.
   */
  @Column({ name: 'parent_packet_id', type: 'bigint', nullable: true })
  parentPacketId: string | null;

  /** 0-based index into the workflow ordered steps. */
  @Column({ name: 'current_step_index', type: 'integer', default: 0 })
  currentStepIndex: number;

  @Column({ type: 'varchar', length: 20, default: 'IN_PROGRESS' })
  status: ProductionOrderStatus;

  @Column({ name: 'step_updated_at', type: 'timestamp', nullable: true })
  stepUpdatedAt: Date | null;

  @Column({ name: 'step_updated_by', type: 'bigint', nullable: true })
  stepUpdatedBy: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;

  @ManyToOne(() => ProductionOrderLine, (line) => line.packets, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'production_order_line_id' })
  line: ProductionOrderLine;
}

/**
 * Output report of the first workflow step ("บันทึกผลผลิต"). Creating one is
 * what creates boxes + QR — nothing is pre-created at order time. The plan
 * quantity not yet reported stays on hold at the first step.
 */
@Entity('production_order_outputs', { schema: 'inventory' })
export class ProductionOrderOutput {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Index()
  @Column({ name: 'production_order_line_id', type: 'bigint' })
  productionOrderLineId: string;

  @Column({ name: 'step_index', type: 'integer', default: 0 })
  stepIndex: number;

  @Column({ type: 'integer' })
  quantity: number;

  @Column({ name: 'box_count', type: 'integer' })
  boxCount: number;

  /** Production day (YYYY-MM-DD, Bangkok). */
  @Column({ name: 'work_date', type: 'date' })
  workDate: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  shift: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  remark: string | null;

  @Column({ name: 'performed_by', type: 'bigint', nullable: true })
  performedBy: string | null;

  @Column({ name: 'performed_at', type: 'timestamp' })
  performedAt: Date;
}

/**
 * One row per step change of a packet — the source of the workflow timeline.
 * `fromStepIndex` null = packet created at step 0; `toStepIndex` equal to the
 * workflow step count = packet completed.
 */
@Entity('production_order_packet_events', { schema: 'inventory' })
export class ProductionOrderPacketEvent {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Index()
  @Column({ name: 'production_order_packet_id', type: 'bigint' })
  productionOrderPacketId: string;

  @Column({ name: 'from_step_index', type: 'integer', nullable: true })
  fromStepIndex: number | null;

  @Column({ name: 'to_step_index', type: 'integer' })
  toStepIndex: number;

  @Column({ name: 'performed_by', type: 'bigint', nullable: true })
  performedBy: string | null;

  // Set explicitly by the service (JS clock, like stepUpdatedAt) — not a DB
  // default, which would be DB-session-local time and skew the timeline.
  @Column({ name: 'performed_at', type: 'timestamp' })
  performedAt: Date;

  @ManyToOne(() => ProductionOrderPacket, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'production_order_packet_id' })
  packet: ProductionOrderPacket;
}
