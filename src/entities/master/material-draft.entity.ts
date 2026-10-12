import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('material_drafts', { schema: 'master' })
export class MaterialDraft {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' }) id: string;
  @Column({ name: 'owner_id', type: 'bigint' }) ownerId: string;
  @Column({ name: 'material_id', type: 'bigint', nullable: true }) materialId: string | null;
  @Column({ name: 'material_updated_at', type: 'timestamp', nullable: true }) materialUpdatedAt: Date | null;
  @Column({ name: 'output_updated_at', type: 'timestamp', nullable: true }) outputUpdatedAt: Date | null;
  @Column({ type: 'smallint', default: 0 }) step: number;
  @Column({ type: 'jsonb' }) data: Record<string, unknown>;
  @Column({ name: 'supplier_ids', type: 'jsonb', default: () => "'[]'::jsonb" }) supplierIds: string[];
  @Column({ name: 'image_path', type: 'varchar', length: 500, nullable: true }) imagePath: string | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamp' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' }) updatedAt: Date;
}
