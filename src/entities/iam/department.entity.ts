import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  OneToMany,
} from 'typeorm';
import { DepartmentPermission } from './department-permission.entity';

@Entity('departments', { schema: 'iam' })
export class Department {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 20, unique: true })
  code: string;

  @Column({ name: 'name_th', type: 'varchar', length: 100 })
  nameTh: string;

  @Column({ name: 'name_en', type: 'varchar', length: 100 })
  nameEn: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'created_by', type: 'bigint', nullable: true })
  createdBy: string;

  @Column({ name: 'updated_by', type: 'bigint', nullable: true })
  updatedBy: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;

  @OneToMany(
    () => DepartmentPermission,
    (departmentPermission) => departmentPermission.department,
  )
  departmentPermissions: DepartmentPermission[];
}
