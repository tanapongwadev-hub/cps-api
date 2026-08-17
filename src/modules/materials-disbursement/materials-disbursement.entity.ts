import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { MaterialDisbursementItem } from './material-disbursement-item.entity';

export const DISBURSEMENT_STATUSES = ['draft', 'confirmed', 'cancelled'] as const;
export type DisbursementStatus = (typeof DISBURSEMENT_STATUSES)[number];

export const DISBURSEMENT_TYPES = ['stock_cut', 'production'] as const;
export type DisbursementType = (typeof DISBURSEMENT_TYPES)[number];

@Entity('materials_disbursements', { schema: 'inventory' })
export class MaterialsDisbursement {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Index({ unique: true })
  @Column({ name: 'disbursement_no', type: 'varchar', length: 30 })
  disbursementNo: string;

  @Index()
  @Column({ name: 'disbursement_type', type: 'varchar', length: 20 })
  disbursementType: DisbursementType;

  @Index()
  @Column({ name: 'disbursement_date', type: 'date' })
  disbursementDate: string;

  @Index()
  @Column({ type: 'varchar', length: 20, default: 'draft' })
  status: DisbursementStatus;

  /** เหตุผลการตัด — ใช้เฉพาะ stock_cut */
  @Column({ type: 'varchar', length: 500, nullable: true })
  reason: string | null;

  @Column({ name: 'attachment_url', type: 'text', nullable: true })
  attachmentUrl: string | null;

  @Column({ name: 'attachment_name', type: 'varchar', length: 255, nullable: true })
  attachmentName: string | null;

  @Column({ type: 'text', nullable: true })
  remark: string | null;

  @Column({ name: 'confirmed_by', type: 'bigint', nullable: true })
  confirmedBy: string | null;

  @Column({ name: 'confirmed_at', type: 'timestamp', nullable: true })
  confirmedAt: Date | null;

  @Column({ name: 'cancelled_by', type: 'bigint', nullable: true })
  cancelledBy: string | null;

  @Column({ name: 'cancelled_at', type: 'timestamp', nullable: true })
  cancelledAt: Date | null;

  @Column({ name: 'cancel_reason', type: 'varchar', length: 500, nullable: true })
  cancelReason: string | null;

  @Column({ name: 'created_by', type: 'bigint', nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;

  @OneToMany(() => MaterialDisbursementItem, (item) => item.disbursement, {
    cascade: true,
  })
  items: MaterialDisbursementItem[];
}
