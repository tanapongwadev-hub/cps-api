import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export const GOODS_RECEIPT_DOC_TYPE = 'GOODS_RECEIPT';

@Entity('document_counters', { schema: 'inventory' })
@Index(['organizationId', 'docType', 'period'], { unique: true })
export class DocumentCounter {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'organization_id', type: 'bigint' })
  organizationId: string;

  @Column({ name: 'doc_type', type: 'varchar', length: 30 })
  docType: string;

  @Column({ type: 'varchar', length: 6 })
  period: string;

  @Column({ name: 'last_number', type: 'integer', default: 0 })
  lastNumber: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
