import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('materials_disbursement_counters', { schema: 'inventory' })
@Index(['disbursementDate'], { unique: true })
export class MaterialsDisbursementCounter {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'disbursement_date', type: 'date' })
  disbursementDate: string;

  @Column({ name: 'last_number', type: 'integer', default: 0 })
  lastNumber: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
