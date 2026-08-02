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
import { Material } from './material.entity';
import { Supplier } from './supplier.entity';

@Entity('supplier_materials', { schema: 'master' })
@Index(['materialId', 'supplierId'], { unique: true })
export class SupplierMaterial {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Index()
  @Column({ name: 'material_id', type: 'bigint' })
  materialId: string;

  @Index()
  @Column({ name: 'supplier_id', type: 'bigint' })
  supplierId: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'created_by', type: 'bigint', nullable: true })
  createdBy: string | null;

  @Column({ name: 'updated_by', type: 'bigint', nullable: true })
  updatedBy: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;

  @ManyToOne(() => Material, (material) => material.supplierMaterials, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'material_id' })
  material: Material;

  @ManyToOne(() => Supplier, (supplier) => supplier.supplierMaterials, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'supplier_id' })
  supplier: Supplier;
}
