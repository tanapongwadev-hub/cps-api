import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ProductBom } from '../../entities/master/product-bom.entity';
import { Product } from '../../entities/master/product.entity';
import { ProductionPlan } from './production-plan.entity';
import { ProductionPlanReservation } from './production-plan-reservation.entity';

@Entity('production_plan_lines', { schema: 'inventory' })
export class ProductionPlanLine {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Index()
  @Column({ name: 'production_plan_id', type: 'bigint' })
  productionPlanId: string;

  @Index()
  @Column({ name: 'product_id', type: 'bigint' })
  productId: string;

  @Index()
  @Column({ name: 'bom_id', type: 'bigint' })
  bomId: string;

  @Column({ type: 'integer' })
  quantity: number;

  @Index()
  @Column({ name: 'need_by_date', type: 'date' })
  needByDate: string;

  @Column({ type: 'text', nullable: true })
  remark: string | null;

  @Column({ name: 'created_by', type: 'bigint', nullable: true })
  createdBy: string | null;

  @Column({ name: 'updated_by', type: 'bigint', nullable: true })
  updatedBy: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;

  @ManyToOne(() => ProductionPlan, (plan) => plan.lines, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'production_plan_id' })
  productionPlan: ProductionPlan;

  @ManyToOne(() => Product, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @ManyToOne(() => ProductBom, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'bom_id' })
  bom: ProductBom;

  @OneToMany(
    () => ProductionPlanReservation,
    (reservation) => reservation.productionPlanLine,
  )
  reservations: ProductionPlanReservation[];
}
