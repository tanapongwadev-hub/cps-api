import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

// Separate owners and FK tables retain the Product BOM/workflow contracts.
export abstract class MaterialEngineeringVersion {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' }) id: string;
  @Column({ name: 'material_id', type: 'bigint' }) materialId: string;
  @Column({ type: 'varchar', length: 20 }) version: string;
  @Column({ type: 'varchar', length: 20, default: 'DRAFT' }) status: 'DRAFT' | 'ACTIVE' | 'INACTIVE';
  @Column({ type: 'text', nullable: true }) remark: string | null;
  @Column({ name: 'created_by', type: 'bigint' }) createdBy: string;
  @Column({ name: 'updated_by', type: 'bigint' }) updatedBy: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
}

@Entity('material_boms', { schema: 'master' })
export class MaterialBom extends MaterialEngineeringVersion {
  @Column({ type: 'text', nullable: true }) specification: string | null;
}

@Entity('material_bom_items', { schema: 'master' })
export class MaterialBomItem {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' }) id: string;
  @Column({ name: 'bom_id', type: 'bigint' }) bomId: string;
  @Column({ name: 'material_id', type: 'bigint' }) materialId: string;
  @Column({ name: 'sort_order', type: 'integer' }) sortOrder: number;
  @Column({ type: 'numeric', precision: 18, scale: 4 }) quantity: string;
  @Column({ name: 'unit_id', type: 'bigint' }) unitId: string;
  @Column({ name: 'is_scrap', type: 'boolean', default: false }) isScrap: boolean;
  @Column({ name: 'wastage_percent', type: 'numeric', precision: 7, scale: 4, nullable: true }) wastagePercent: string | null;
  @Column({ type: 'text', nullable: true }) remark: string | null;
}

@Entity('material_workflows', { schema: 'master' })
export class MaterialWorkflow extends MaterialEngineeringVersion {}

@Entity('material_workflow_steps', { schema: 'master' })
export class MaterialWorkflowStep {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' }) id: string;
  @Column({ name: 'workflow_id', type: 'bigint' }) workflowId: string;
  @Column({ name: 'sort_order', type: 'integer' }) sortOrder: number;
  @Column({ name: 'process_step_id', type: 'bigint' }) processStepId: string;
  @Column({ type: 'text', nullable: true }) description: string | null;
}
