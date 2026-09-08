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
import { MaterialReceiving } from './material-receiving.entity';

export const PACKAGE_STATUSES = [
  'pending',
  'in_stock',
  'partial',
  'issued',
  'damaged',
  'returned',
] as const;

export type PackageStatus = (typeof PACKAGE_STATUSES)[number];

@Entity('material_receiving_packages', { schema: 'inventory' })
@Index(['materialReceivingId', 'packageNo'], { unique: true })
export class MaterialReceivingPackage {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Index()
  @Column({ name: 'material_receiving_id', type: 'bigint' })
  materialReceivingId: string;

  @Column({ name: 'package_no', type: 'integer' })
  packageNo: number;

  /**
   * LOT-CCI-DETAIL — e.g. CCI-2026H1300001-01
   * Populated from the receiving's internal lot no + sequential package suffix.
   */
  @Index({ unique: true })
  @Column({ name: 'lot_detail_no', type: 'varchar', length: 40, nullable: true })
  lotDetailNo: string | null;

  @Column({ type: 'numeric', precision: 18, scale: 4 })
  quantity: string;

  /**
   * Remaining/current quantity in this box — starts equal to `quantity` at
   * receive time. Nothing decrements this yet (materials-disbursement's
   * FIFO consumption logic is unchanged/out of scope for Material
   * Receiving) — see AGENTS.md § Material Receiving for the follow-up.
   */
  @Column({ name: 'remaining_quantity', type: 'numeric', precision: 18, scale: 4 })
  remainingQuantity: string;

  @Column({ name: 'qr_code', type: 'text', nullable: true })
  qrCode: string | null;

  @Index()
  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: PackageStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;

  @ManyToOne(() => MaterialReceiving, (receiving) => receiving.packages, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'material_receiving_id' })
  materialReceiving: MaterialReceiving;
}
