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

/**
 * ใบสั่งผลิต — created from a Production Plan whose Job Order has been fully
 * issued. Each plan line is split into packets (ceil(quantity / product
 * packing)); every packet carries its own QR and walks through the product
 * ACTIVE workflow steps (pinned on the line at order time).
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
