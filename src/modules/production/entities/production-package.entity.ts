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
import { ProductionLot } from './production-lot.entity';

export const PACKAGE_STATUSES = [
  'PACKED',
  'STORED',
  'SHIPPED',
  'VOID',
] as const;
export type PackageStatus = (typeof PACKAGE_STATUSES)[number];

/**
 * A packed box at the receiving step (one FG/STORE lot per box). The QR
 * encodes only `qrCode`; everything else is read from the system at scan.
 */
@Entity('production_packages', { schema: 'inventory' })
@Index(['fgLotId', 'boxNo'], { unique: true })
export class ProductionPackage {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  /** e.g. QR-FG-691002-001-BOX001 */
  @Index({ unique: true })
  @Column({ name: 'qr_code', type: 'varchar', length: 80 })
  qrCode: string;

  @Column({ name: 'production_order_id', type: 'bigint' })
  productionOrderId: string;

  @Column({ name: 'production_order_line_id', type: 'bigint' })
  productionOrderLineId: string;

  @Column({ name: 'product_id', type: 'bigint' })
  productId: string;

  @Column({ name: 'fg_lot_id', type: 'bigint' })
  fgLotId: string;

  @Column({ name: 'box_no', type: 'integer' })
  boxNo: number;

  @Column({ name: 'unit_type', type: 'varchar', length: 10 })
  unitType: 'FULL' | 'PARTIAL';

  @Column({ name: 'initial_qty', type: 'integer' })
  initialQty: number;

  @Column({ name: 'current_qty', type: 'integer' })
  currentQty: number;

  @Column({ type: 'varchar', length: 12, default: 'PACKED' })
  status: PackageStatus;

  @Column({ name: 'print_count', type: 'integer', default: 0 })
  printCount: number;

  @Column({ name: 'created_by', type: 'bigint', nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => ProductionLot)
  @JoinColumn({ name: 'fg_lot_id' })
  fgLot: ProductionLot;
}

/** Materialized origin composition of a box. Immutable. */
@Entity('production_package_sources', { schema: 'inventory' })
export class ProductionPackageSource {
  @PrimaryColumn({ name: 'package_id', type: 'bigint' })
  packageId: string;

  @PrimaryColumn({ name: 'origin_lot_id', type: 'bigint' })
  originLotId: string;

  @Column({ type: 'integer' })
  qty: number;

  @ManyToOne(() => ProductionLot)
  @JoinColumn({ name: 'origin_lot_id' })
  originLot: ProductionLot;
}
