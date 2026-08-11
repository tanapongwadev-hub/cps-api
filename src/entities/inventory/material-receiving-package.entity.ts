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

  @Column({ type: 'numeric', precision: 18, scale: 4 })
  quantity: string;

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
