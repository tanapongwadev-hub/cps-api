import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Material } from '../../entities/master/material.entity';
import { MaterialsDisbursement } from './materials-disbursement.entity';
import { MaterialDisbursementPackage } from './material-disbursement-package.entity';

@Entity('material_disbursement_items', { schema: 'inventory' })
export class MaterialDisbursementItem {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Index()
  @Column({ name: 'disbursement_id', type: 'bigint' })
  disbursementId: string;

  @Index()
  @Column({ name: 'material_id', type: 'bigint' })
  materialId: string;

  /** จำนวนที่ขอเบิก */
  @Column({
    name: 'requested_quantity',
    type: 'numeric',
    precision: 18,
    scale: 4,
  })
  requestedQuantity: string;

  /** จำนวนที่จ่ายจริง (หลัง FIFO) */
  @Column({
    name: 'disbursed_quantity',
    type: 'numeric',
    precision: 18,
    scale: 4,
  })
  disbursedQuantity: string;

  @Column({ name: 'created_by', type: 'bigint', nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;

  @ManyToOne(() => MaterialsDisbursement, (disbursement) => disbursement.items, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'disbursement_id' })
  disbursement: MaterialsDisbursement;

  @ManyToOne(() => Material, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'material_id' })
  material: Material;

  @OneToMany(() => MaterialDisbursementPackage, (pkg) => pkg.disbursementItem, {
    cascade: true,
  })
  packages: MaterialDisbursementPackage[];
}
