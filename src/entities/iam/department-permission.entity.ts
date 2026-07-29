import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Department } from './department.entity';
import { Permission } from './permission.entity';

@Entity('department_permissions', { schema: 'iam' })
@Index(['permissionId', 'departmentId'], { unique: true })
export class DepartmentPermission {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Index()
  @Column({ name: 'permission_id', type: 'bigint' })
  permissionId: string;

  @Index()
  @Column({ name: 'department_id', type: 'bigint' })
  departmentId: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;

  @ManyToOne(
    () => Permission,
    (permission) => permission.departmentPermissions,
    { onDelete: 'CASCADE' },
  )
  @JoinColumn({ name: 'permission_id' })
  permission: Permission;

  @ManyToOne(
    () => Department,
    (department) => department.departmentPermissions,
    { onDelete: 'CASCADE' },
  )
  @JoinColumn({ name: 'department_id' })
  department: Department;
}
