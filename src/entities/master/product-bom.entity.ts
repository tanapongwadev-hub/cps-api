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
import { Material } from './material.entity';
import { Product } from './product.entity';
import { Unit } from './unit.entity';

export enum BomStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

@Entity('product_boms', { schema: 'master' })
@Index(['productId', 'status'])
export class ProductBom {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  /** อ้างอิงสินค้าที่ BOM นี้เป็นของ */
  @Index()
  @Column({ name: 'product_id', type: 'bigint' })
  productId: string;

  /** เวอร์ชัน BOM: v1, v2, v3... */
  @Column({ type: 'varchar', length: 20 })
  version: string;

  /** สถานะ BOM */
  @Index()
  @Column({
    type: 'varchar',
    length: 20,
    default: BomStatus.DRAFT,
  })
  status: BomStatus;

  /** สเปค/ข้อกำหนดของ BOM นี้ */
  @Column({ type: 'text', nullable: true })
  specification: string | null;

  /** หมายเหตุ */
  @Column({ type: 'text', nullable: true })
  remark: string | null;

  /** วันที่เริ่มใช้งาน */
  @Column({ name: 'effective_from', type: 'date', nullable: true })
  effectiveFrom: Date | null;

  /** วันที่สิ้นสุดการใช้งาน */
  @Column({ name: 'effective_to', type: 'date', nullable: true })
  effectiveTo: Date | null;

  @Column({ name: 'created_by', type: 'bigint', nullable: true })
  createdBy: string | null;

  @Column({ name: 'updated_by', type: 'bigint', nullable: true })
  updatedBy: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @OneToMany(() => ProductBomItem, (item) => item.bom, { cascade: true })
  items: ProductBomItem[];
}

@Entity('product_bom_items', { schema: 'master' })
export class ProductBomItem {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Index()
  @Column({ name: 'bom_id', type: 'bigint' })
  bomId: string;

  /** อ้างอิงวัตถุดิบ */
  @Index()
  @Column({ name: 'material_id', type: 'bigint' })
  materialId: string;

  /** ลำดับการแสดงในรายการ */
  @Column({ name: 'sort_order', type: 'integer', default: 0 })
  sortOrder: number;

  /** จำนวนวัตถุดิบที่ใช้ต่อชิ้นสินค้า */
  @Column({ type: 'decimal', precision: 14, scale: 4 })
  quantity: number;

  /** หน่วยของวัตถุดิบนั้น */
  @Column({ name: 'unit_id', type: 'bigint' })
  unitId: string;

  /** วัตถุดิบที่เป็นของเสียจากกระบวนการ */
  @Column({ name: 'is_scrap', type: 'boolean', default: false })
  isScrap: boolean;

  /** % ของเสียที่คาดว่าจะเกิด */
  @Column({ name: 'wastage_percent', type: 'decimal', precision: 5, scale: 2, nullable: true })
  wastagePercent: number | null;

  /** หมายเหตุ/คำอธิบายเพิ่มเติม */
  @Column({ type: 'text', nullable: true })
  remark: string | null;

  @Column({ name: 'created_by', type: 'bigint', nullable: true })
  createdBy: string | null;

  @Column({ name: 'updated_by', type: 'bigint', nullable: true })
  updatedBy: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;

  @ManyToOne(() => ProductBom, (bom) => bom.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'bom_id' })
  bom: ProductBom;

  @ManyToOne(() => Material, { eager: false })
  @JoinColumn({ name: 'material_id' })
  material: Material;

  @ManyToOne(() => Unit, { eager: false })
  @JoinColumn({ name: 'unit_id' })
  unit: Unit;
}
