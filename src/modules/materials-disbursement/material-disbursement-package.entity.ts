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
import { MaterialReceivingPackage } from '../../entities/inventory/material-receiving-package.entity';
import { MaterialDisbursementItem } from './material-disbursement-item.entity';
import { ProductionPlanReservation } from '../production-plans/production-plan-reservation.entity';

@Entity('material_disbursement_packages', { schema: 'inventory' })
export class MaterialDisbursementPackage {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Index()
  @Column({ name: 'disbursement_item_id', type: 'bigint' })
  disbursementItemId: string;

  @Index()
  @Column({ name: 'package_id', type: 'bigint' })
  packageId: string;

  /** จำนวนที่หักออกจาก package นี้ */
  @Column({
    name: 'disbursed_quantity',
    type: 'numeric',
    precision: 18,
    scale: 4,
  })
  disbursedQuantity: string;

  @Column({ name: 'fifo_order', type: 'integer', nullable: true })
  fifoOrder: number | null;

  @Column({ name: 'reversed_at', type: 'timestamp', nullable: true })
  reversedAt: Date | null;

  @Column({ name: 'reversed_by', type: 'bigint', nullable: true })
  reversedBy: string | null;

  /**
   * Set only when this allocation came from a Material Job Order issuing
   * against a Production Plan reservation — the direct link from "which
   * package did this disbursement line take" back to "which reservation
   * authorized it", without joining through the package + plan tables.
   */
  @Index()
  @Column({
    name: 'production_plan_reservation_id',
    type: 'bigint',
    nullable: true,
  })
  productionPlanReservationId: string | null;

  @Column({ name: 'created_by', type: 'bigint', nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;

  @ManyToOne(() => MaterialDisbursementItem, (item) => item.packages, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'disbursement_item_id' })
  disbursementItem: MaterialDisbursementItem;

  @ManyToOne(() => MaterialReceivingPackage, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'package_id' })
  package: MaterialReceivingPackage;

  @ManyToOne(() => ProductionPlanReservation, {
    nullable: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'production_plan_reservation_id' })
  productionPlanReservation: ProductionPlanReservation | null;
}
