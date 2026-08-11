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
import { Material } from '../master/material.entity';

@Entity('stock_balances', { schema: 'inventory' })
@Index(['materialId'], { unique: true })
export class StockBalance {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'material_id', type: 'bigint' })
  materialId: string;

  @Column({ type: 'numeric', precision: 18, scale: 4, default: 0 })
  quantity: string;

  @Column({
    name: 'last_movement_at',
    type: 'timestamp',
    nullable: true,
  })
  lastMovementAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;

  @ManyToOne(() => Material, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'material_id' })
  material: Material;
}
