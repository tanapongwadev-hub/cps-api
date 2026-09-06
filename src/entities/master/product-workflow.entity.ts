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
import { Product } from './product.entity';

export enum ProductWorkflowStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

/**
 * ProductWorkflow — ลำดับขั้นตอนกระบวนการผลิตของสินค้า (production routing)
 *
 * แยกจาก ProductBom โดยเจตนา: BOM เก็บ "ใช้วัตถุดิบอะไรบ้าง" ส่วน Workflow
 * เก็บ "ต้องผ่านขั้นตอนอะไรบ้างตามลำดับ" (เช่น เชื่อม -> CNC -> ปั๊ม -> ขัด
 * -> เช็ค -> QC) — คนละมิติของข้อมูล ไม่ควรรวมเป็นตารางเดียวกัน
 *
 * Versioning/status mirrors ProductBom: create ใหม่เสมอเป็น DRAFT, ต้อง
 * activate เพื่อใช้งานจริง (ซึ่งจะ deactivate workflow ACTIVE ตัวอื่นของ
 * สินค้าเดียวกันโดยอัตโนมัติ).
 */
@Entity('product_workflows', { schema: 'master' })
@Index(['productId', 'status'])
export class ProductWorkflow {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  /** อ้างอิงสินค้าที่ workflow นี้เป็นของ */
  @Index()
  @Column({ name: 'product_id', type: 'bigint' })
  productId: string;

  /** เวอร์ชัน workflow: v1, v2, v3... */
  @Column({ type: 'varchar', length: 20 })
  version: string;

  /** สถานะ workflow */
  @Index()
  @Column({
    type: 'varchar',
    length: 20,
    default: ProductWorkflowStatus.DRAFT,
  })
  status: ProductWorkflowStatus;

  /** หมายเหตุ/ข้อกำหนดของ workflow นี้ */
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

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @OneToMany(() => ProductWorkflowStep, (step) => step.workflow, {
    cascade: true,
  })
  steps: ProductWorkflowStep[];
}

@Entity('product_workflow_steps', { schema: 'master' })
export class ProductWorkflowStep {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Index()
  @Column({ name: 'workflow_id', type: 'bigint' })
  workflowId: string;

  /** ลำดับขั้นตอน (1-based ในการแสดงผล, จัดเก็บแบบ 0-based ต่อเนื่อง) */
  @Column({ name: 'sort_order', type: 'integer', default: 0 })
  sortOrder: number;

  /** ชื่อขั้นตอน เช่น "นำไปเชื่อมชิ้นงาน", "นำไป CNC", "ปิดกระบวนการผลิต" */
  @Column({ name: 'step_name', type: 'varchar', length: 255 })
  stepName: string;

  /** คำอธิบายเพิ่มเติมของขั้นตอน (ไม่บังคับ) */
  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'created_by', type: 'bigint', nullable: true })
  createdBy: string | null;

  @Column({ name: 'updated_by', type: 'bigint', nullable: true })
  updatedBy: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;

  @ManyToOne(() => ProductWorkflow, (workflow) => workflow.steps, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'workflow_id' })
  workflow: ProductWorkflow;
}
