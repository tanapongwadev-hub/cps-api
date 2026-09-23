import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ProductionPlanLine } from './production-plan-line.entity';

export const PRODUCTION_PLAN_STATUSES = [
  'DRAFT',
  'APPROVED',
  'ISSUED',
  'CANCELLED',
  'EXPIRED',
] as const;

export type ProductionPlanStatus = (typeof PRODUCTION_PLAN_STATUSES)[number];

@Entity('production_plans', { schema: 'inventory' })
export class ProductionPlan {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 20 })
  code: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  title: string | null;

  @Index()
  @Column({ type: 'varchar', length: 20, default: 'DRAFT' })
  status: ProductionPlanStatus;

  @Column({ type: 'text', nullable: true })
  remark: string | null;

  @Column({ name: 'created_by', type: 'bigint', nullable: true })
  createdBy: string | null;

  @Column({ name: 'approved_by', type: 'bigint', nullable: true })
  approvedBy: string | null;

  @Column({ name: 'approved_at', type: 'timestamp', nullable: true })
  approvedAt: Date | null;

  @Column({ name: 'issued_by', type: 'bigint', nullable: true })
  issuedBy: string | null;

  @Column({ name: 'issued_at', type: 'timestamp', nullable: true })
  issuedAt: Date | null;

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

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;

  @OneToMany(() => ProductionPlanLine, (line) => line.productionPlan, {
    cascade: true,
  })
  lines: ProductionPlanLine[];
}
