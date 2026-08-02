import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { SupplierMaterial } from './supplier-material.entity';

@Entity('suppliers', { schema: 'master' })
@Index(['code'], { unique: true })
export class Supplier {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ type: 'varchar', length: 50 })
  code: string;

  @Column({ name: 'name_th', type: 'varchar', length: 255 })
  nameTh: string;

  @Column({ name: 'name_en', type: 'varchar', length: 255, nullable: true })
  nameEn: string | null;

  @Column({ name: 'tax_id', type: 'varchar', length: 20, nullable: true })
  taxId: string | null;

  @Column({
    name: 'contact_name',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  contactName: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  telephone: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email: string | null;

  @Column({ type: 'text', nullable: true })
  address: string | null;

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

  @OneToMany(
    () => SupplierMaterial,
    (supplierMaterial) => supplierMaterial.supplier,
  )
  supplierMaterials: SupplierMaterial[];
}
