import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';

export type AuditLogOutcome =
  'ATTEMPTED' | 'SUCCESS' | 'FAILURE' | 'DENIED' | 'TIMEOUT';

@Entity('audit_logs', { schema: 'iam' })
export class AuditLog {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Index({ unique: true })
  @Column({ name: 'event_id', type: 'varchar', length: 64 })
  eventId: string;

  @Index()
  @Column({ name: 'event_name', type: 'varchar', length: 120 })
  eventName: string;

  @Column({ name: 'schema_version', type: 'integer', default: 1 })
  schemaVersion: number;

  @Column({ type: 'varchar', length: 20, default: 'audit' })
  stream: 'audit';

  @Column({ type: 'varchar', length: 32, default: 'SUCCESS' })
  outcome: AuditLogOutcome;

  @Index()
  @Column({ name: 'actor_user_id', type: 'bigint', nullable: true })
  actorUserId: string | null;

  @Index()
  @Column({ name: 'department_id', type: 'bigint', nullable: true })
  departmentId: string | null;

  @Index()
  @Column({ type: 'varchar', length: 50 })
  action: string;

  @Column({ name: 'target_type', type: 'varchar', length: 50, nullable: true })
  targetType: string | null;

  @Column({ name: 'target_id', type: 'bigint', nullable: true })
  targetId: string | null;

  @Column({ name: 'before_data', type: 'jsonb', nullable: true })
  beforeData: any;

  @Column({ name: 'after_data', type: 'jsonb', nullable: true })
  afterData: any;

  @Column({ name: 'ip_address', type: 'varchar', length: 45, nullable: true })
  ipAddress: string | null;

  @Index()
  @Column({ name: 'trace_id', type: 'varchar', length: 40, nullable: true })
  traceId: string | null;

  @Index()
  @Column({
    name: 'correlation_id',
    type: 'varchar',
    length: 128,
    nullable: true,
  })
  correlationId: string | null;

  @Column({ name: 'request_id', type: 'varchar', length: 80, nullable: true })
  requestId: string | null;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @Column({ name: 'occurred_at', type: 'timestamp' })
  occurredAt: Date;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'actor_user_id' })
  actorUser: User;
}
