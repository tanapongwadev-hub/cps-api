import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

// ร่างของเมนู "สร้างครบชุด" (Material + Product + BOM + Workflow) — เก็บเป็น JSON ต่อเจ้าของ
@Entity('setup_drafts', { schema: 'master' })
export class SetupDraft {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' }) id: string;
  @Column({ name: 'owner_id', type: 'bigint' }) ownerId: string;
  @Column({ type: 'varchar', length: 255, default: '' }) title: string;
  @Column({ type: 'smallint', default: 0 }) step: number;
  @Column({ type: 'jsonb' }) data: Record<string, unknown>;
  @CreateDateColumn({ name: 'created_at', type: 'timestamp' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' }) updatedAt: Date;
}
