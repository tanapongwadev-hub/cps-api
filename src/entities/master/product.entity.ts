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
import { Customer } from './customer.entity';
import { DeliveryType } from './delivery-type.entity';
import { LoadingPoint } from './loading-point.entity';
import { Location } from './location.entity';
import { ProcessLine } from './process-line.entity';
import { ProductModel } from './product-model.entity';
import { ProductType } from './product-type.entity';
import { Unit } from './unit.entity';
import { ProductBom } from './product-bom.entity';

/**
 * Product — ชิ้นส่วนยานยนต์
 *
 * Safety stock / min stock formulas (server-side, recomputed on every write):
 *   safety_stock = lot_size            (หนึ่ง lot เป็น safety buffer)
 *   min_stock     = packing            (หนึ่ง pack เป็น reorder trigger)
 *
 * ถ้าผู้ใช้ต้องการ override ให้ส่ง safetyStock / minStock มาใน DTO เพื่อใช้ค่าที่กำหนดเอง
 */
@Entity('products', { schema: 'master' })
@Index(['code'], { unique: true })
export class Product {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  /** รหัสสินค้า เช่น PRD-001 */
  @Column({ type: 'varchar', length: 50 })
  code: string;

  /** ชื่อสินค้า */
  @Column({ type: 'varchar', length: 255 })
  name: string;

  /** หน่วยนับหลัก */
  @Index()
  @Column({ name: 'unit_id', type: 'bigint' })
  unitId: string;

  /** โมเดลสินค้า (FK → product_models) */
  @Index()
  @Column({ name: 'model_id', type: 'bigint' })
  modelId: string;

  /** ลูกค้า/ผู้สั่งผลิต (FK → customers) */
  @Index()
  @Column({ name: 'customer_id', type: 'bigint' })
  customerId: string;

  /** จำนวนชิ้นต่อ pack (เช่น 50 ชิ้น/ลัง) */
  @Column({ type: 'integer', default: 1 })
  packing: number;

  /** ที่ตั้งคลังสินค้า (FK → locations) */
  @Index()
  @Column({ name: 'location_id', type: 'bigint' })
  locationId: string;

  /** Safety stock — สต๊อกขั้นต่ำที่ต้องมี (คำนวณจาก lot_size) */
  @Column({ name: 'safety_stock', type: 'integer', default: 0 })
  safetyStock: number;

  /** ประเภทสินค้า (FK → product_types) */
  @Index()
  @Column({ name: 'product_type_id', type: 'bigint' })
  productTypeId: string;

  /** Lot size — จำนวนชิ้นต่อการผลิตหนึ่ง lot */
  @Column({ name: 'lot_size', type: 'integer', default: 1 })
  lotSize: number;

  /** Min stock — จุดสั่งผลิตซ่อม (คำนวณจาก packing) */
  @Column({ name: 'min_stock', type: 'integer', default: 0 })
  minStock: number;

  /** ประเภทการจัดส่ง (FK → delivery_types) */
  @Index()
  @Column({ name: 'delivery_type_id', type: 'bigint' })
  deliveryTypeId: string;

  /** สเกล/อัตราส่วนบรรจุภัณฑ์ (เช่น 1:10, 1:50) */
  @Column({ type: 'varchar', length: 50, nullable: true })
  scale: string | null;

  /** จุดขนถ่ายสินค้า (FK → loading_points) */
  @Index()
  @Column({ name: 'loading_point_id', type: 'bigint' })
  loadingPointId: string;

  /** สายการผลิต (FK → process_lines) */
  @Index()
  @Column({ name: 'process_line_id', type: 'bigint' })
  processLineId: string;

  /** path รูปสินค้า */
  @Column({ name: 'product_image_path', type: 'varchar', length: 500, nullable: true })
  productImagePath: string | null;

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

  // --- Relations ---

  @ManyToOne(() => Unit, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'unit_id' })
  unit: Unit;

  @ManyToOne(() => ProductModel, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'model_id' })
  model: ProductModel;

  @ManyToOne(() => Customer, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'customer_id' })
  customer: Customer;

  @ManyToOne(() => Location, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'location_id' })
  location: Location;

  @ManyToOne(() => ProductType, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'product_type_id' })
  productType: ProductType;

  @ManyToOne(() => DeliveryType, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'delivery_type_id' })
  deliveryType: DeliveryType;

  @ManyToOne(() => LoadingPoint, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'loading_point_id' })
  loadingPoint: LoadingPoint;

  @ManyToOne(() => ProcessLine, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'process_line_id' })
  processLine: ProcessLine;

  @OneToMany(() => ProductBom, (bom) => bom.product)
  boms: ProductBom[];
}
