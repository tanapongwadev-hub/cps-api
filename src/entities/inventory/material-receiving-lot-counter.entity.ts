import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('material_receiving_lot_counters', { schema: 'inventory' })
@Index(['lotDate'], { unique: true })
export class MaterialReceivingLotCounter {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'lot_date', type: 'date' })
  lotDate: string;

  @Column({ name: 'last_number', type: 'integer', default: 0 })
  lastNumber: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
