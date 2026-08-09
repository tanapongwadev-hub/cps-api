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
import { DeliveryType } from './delivery-type.entity';
import { LoadingPoint } from './loading-point.entity';
import { MaterialModel } from './material-model.entity';
import { SupplierMaterial } from './supplier-material.entity';
import { Unit } from './unit.entity';

export enum MaterialType {
  PC = 'PC',
  OF = 'OF',
  OF_MAT = 'OF_MAT',
}

@Entity('materials', { schema: 'master' })
@Index(['code'], { unique: true })
export class Material {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ type: 'varchar', length: 50 })
  code: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Index()
  @Column({
    name: 'type',
    type: 'varchar',
    length: 20,
    nullable: true,
    default: null,
  })
  type: MaterialType | null;

  @Index()
  @Column({ name: 'unit_id', type: 'bigint' })
  unitId: string;

  @Index()
  @Column({
    name: 'delivery_type_id',
    type: 'bigint',
    nullable: true,
  })
  deliveryTypeId: string | null;

  @Index()
  @Column({ name: 'model_id', type: 'bigint', nullable: true })
  modelId: string | null;

  @Index()
  @Column({ name: 'loading_point_id', type: 'bigint', nullable: true })
  loadingPointId: string | null;

  @Column({
    name: 'process_line_name',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  processLineName: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  scale: string | null;

  @Column({
    name: 'image_path',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  imagePath: string | null;

  @Column({ type: 'text', nullable: true })
  specification: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({
    name: 'packing_quantity',
    type: 'integer',
    nullable: true,
  })
  packingQuantity: number | null;

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

  @ManyToOne(() => Unit, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'unit_id' })
  unit: Unit;

  @ManyToOne(() => DeliveryType, {
    nullable: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'delivery_type_id' })
  deliveryType: DeliveryType | null;

  @ManyToOne(() => MaterialModel, {
    nullable: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'model_id' })
  model: MaterialModel | null;

  @ManyToOne(() => LoadingPoint, {
    nullable: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'loading_point_id' })
  loadingPoint: LoadingPoint | null;

  @OneToMany(
    () => SupplierMaterial,
    (supplierMaterial) => supplierMaterial.material,
  )
  supplierMaterials: SupplierMaterial[];
}
