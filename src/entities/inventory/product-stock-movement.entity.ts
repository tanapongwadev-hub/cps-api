import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Product } from '../master/product.entity';
import { User } from '../iam/user.entity';

@Entity('product_stock_movements', { schema: 'inventory' })
@Index(['productId', 'requestId'], { unique: true })
export class ProductStockMovement {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'product_id', type: 'bigint' })
  productId: string;

  @Column({ name: 'request_id', type: 'uuid' })
  requestId: string;

  @Column({ type: 'varchar', length: 10 })
  type: 'receive' | 'issue';

  @Column({ type: 'numeric', precision: 18, scale: 4 })
  quantity: string;

  @Column({ name: 'balance_after', type: 'numeric', precision: 18, scale: 4 })
  balanceAfter: string;

  @Column({ name: 'reference_no', type: 'varchar', length: 100 })
  referenceNo: string;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  remark: string | null;

  @Column({ name: 'recorded_by', type: 'bigint' })
  recordedBy: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => Product, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'recorded_by' })
  actor: User;
}
