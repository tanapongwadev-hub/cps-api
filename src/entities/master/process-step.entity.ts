import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

// Master data for Product Workflow steps (see product-workflow.entity.ts) —
// selectable options for "what production step is this" (e.g. เชื่อมชิ้นงาน,
// CNC, ปั๊ม), so the wizard can offer a dropdown instead of free text.
// Structurally a mirror of DeliveryType (see delivery-type.entity.ts).
@Entity('process_steps', { schema: 'master' })
@Index(['code'], { unique: true })
export class ProcessStep {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ type: 'varchar', length: 50 })
  code: string;

  @Column({ name: 'name_th', type: 'varchar', length: 100 })
  nameTh: string;

  @Column({ name: 'name_en', type: 'varchar', length: 100, nullable: true })
  nameEn: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

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
}
