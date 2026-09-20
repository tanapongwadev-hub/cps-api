import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';
import { UserDepartmentRole } from './user-department-role.entity';

@Entity('auth_sessions', { schema: 'iam' })
export class AuthSession {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Index()
  @Column({ name: 'user_id', type: 'bigint' })
  userId: string;

  @Index()
  @Column({
    name: 'active_user_department_role_id',
    type: 'bigint',
    nullable: true,
  })
  activeUserDepartmentRoleId: string | null;

  @Column({ name: 'refresh_token_hash', type: 'varchar', length: 255 })
  refreshTokenHash: string;

  @Column({ name: 'previous_refresh_token_hash', type: 'varchar', length: 255, nullable: true })
  previousRefreshTokenHash: string | null;

  @Column({ name: 'refresh_grace_until', type: 'timestamp', nullable: true })
  refreshGraceUntil: Date | null;

  @Column({ name: 'refresh_claims', type: 'jsonb', nullable: true })
  refreshClaims: Record<string, unknown> | null;

  @Column({ name: 'last_used_at', type: 'timestamp', nullable: true })
  lastUsedAt: Date | null;

  @Column({ name: 'ip_address', type: 'varchar', length: 45, nullable: true })
  ipAddress: string;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent: string;

  @Column({ name: 'expires_at', type: 'timestamp' })
  expiresAt: Date;

  @Column({ name: 'revoked_at', type: 'timestamp', nullable: true })
  revokedAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => UserDepartmentRole, { nullable: true })
  @JoinColumn({ name: 'active_user_department_role_id' })
  activeUserDepartmentRole: UserDepartmentRole;
}
