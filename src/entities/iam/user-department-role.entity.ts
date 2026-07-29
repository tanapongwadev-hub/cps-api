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
import { Department } from './department.entity';
import { Role } from './role.entity';

@Entity('user_department_roles', { schema: 'iam' })
export class UserDepartmentRole {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Index()
  @Column({ name: 'user_id', type: 'bigint' })
  userId: string;

  @Index()
  @Column({ name: 'department_id', type: 'bigint', nullable: true })
  departmentId: string | null;

  @Index()
  @Column({ name: 'role_id', type: 'bigint' })
  roleId: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'assigned_at', type: 'timestamp', nullable: true })
  assignedAt: Date;

  @Column({ name: 'assigned_by', type: 'bigint', nullable: true })
  assignedBy: string;

  @Column({ name: 'expired_at', type: 'timestamp', nullable: true })
  expiredAt: Date;

  @Column({ name: 'created_by', type: 'bigint', nullable: true })
  createdBy: string;

  @Column({ name: 'updated_by', type: 'bigint', nullable: true })
  updatedBy: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Department, { nullable: true })
  @JoinColumn({ name: 'department_id' })
  department: Department | null;

  @ManyToOne(() => Role)
  @JoinColumn({ name: 'role_id' })
  role: Role;
}
