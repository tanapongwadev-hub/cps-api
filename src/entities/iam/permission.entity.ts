import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { Menu } from './menu.entity';
import { Action } from './action.entity';
import { DepartmentPermission } from './department-permission.entity';

@Entity('permissions', { schema: 'iam' })
export class Permission {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Index()
  @Column({ name: 'menu_id', type: 'bigint' })
  menuId: string;

  @Index()
  @Column({ name: 'action_id', type: 'bigint' })
  actionId: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 100, unique: true })
  code: string;

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

  @ManyToOne(() => Menu)
  @JoinColumn({ name: 'menu_id' })
  menu: Menu;

  @ManyToOne(() => Action)
  @JoinColumn({ name: 'action_id' })
  action: Action;

  @OneToMany(
    () => DepartmentPermission,
    (departmentPermission) => departmentPermission.permission,
  )
  departmentPermissions: DepartmentPermission[];
}
