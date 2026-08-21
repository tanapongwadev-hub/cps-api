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

@Entity('menus', { schema: 'iam' })
export class Menu {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Index()
  @Column({ name: 'parent_id', type: 'bigint', nullable: true })
  parentId: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 50, unique: true })
  code: string;

  @Column({ name: 'name_th', type: 'varchar', length: 100 })
  nameTh: string;

  @Column({ name: 'name_en', type: 'varchar', length: 100 })
  nameEn: string;

  @Column({
    name: 'menu_type',
    type: 'enum',
    enum: ['MAIN', 'SUB', 'BUTTON'],
    default: 'MAIN',
  })
  menuType: 'MAIN' | 'SUB' | 'BUTTON';

  @Column({ type: 'varchar', length: 255, nullable: true })
  path: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  icon: string;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @Column({ name: 'is_visible', type: 'boolean', default: true })
  isVisible: boolean;

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

  @ManyToOne(() => Menu, { nullable: true })
  @JoinColumn({ name: 'parent_id' })
  parent: Menu | null;
}
