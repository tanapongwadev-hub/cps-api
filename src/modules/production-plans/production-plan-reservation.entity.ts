import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { MaterialReceivingPackage } from '../../entities/inventory/material-receiving-package.entity';
import { ProductionPlanLine } from './production-plan-line.entity';

export const PRODUCTION_PLAN_RESERVATION_RELEASE_TYPES = [
  'ISSUED',
  'CANCELLED',
  'EXPIRED',
] as const;
export type ProductionPlanReservationReleaseType =
  (typeof PRODUCTION_PLAN_RESERVATION_RELEASE_TYPES)[number];

@Entity('production_plan_reservations', { schema: 'inventory' })
@Index(['productionPlanLineId', 'materialReceivingPackageId'], {
  unique: true,
})
export class ProductionPlanReservation {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Index()
  @Column({ name: 'production_plan_line_id', type: 'bigint' })
  productionPlanLineId: string;

  @Index()
  @Column({ name: 'material_receiving_package_id', type: 'bigint' })
  materialReceivingPackageId: string;

  @Column({
    name: 'reserved_quantity',
    type: 'decimal',
    precision: 18,
    scale: 4,
  })
  reservedQuantity: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @Column({ name: 'released_at', type: 'timestamp', nullable: true })
  releasedAt: Date | null;

  @Column({ name: 'release_type', type: 'varchar', length: 20, nullable: true })
  releaseType: ProductionPlanReservationReleaseType | null;

  @Column({ name: 'released_by', type: 'bigint', nullable: true })
  releasedBy: string | null;

  @ManyToOne(() => ProductionPlanLine, (line) => line.reservations, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'production_plan_line_id' })
  productionPlanLine: ProductionPlanLine;

  @ManyToOne(() => MaterialReceivingPackage, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'material_receiving_package_id' })
  materialReceivingPackage: MaterialReceivingPackage;
}
