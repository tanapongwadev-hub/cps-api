import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export interface ProcessingSourcePackage {
  packageId: string;
  lotDetailNo: string | null;
  quantity: string;
}

@Entity('material_processings', { schema: 'inventory' })
export class MaterialProcessing {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Index({ unique: true })
  @Column({ name: 'request_key', type: 'uuid' })
  requestKey: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 40 })
  code: string;

  @Index()
  @Column({ name: 'source_receiving_id', type: 'bigint' })
  sourceReceivingId: string;

  @Index({ unique: true })
  @Column({ name: 'output_receiving_id', type: 'bigint' })
  outputReceivingId: string;

  @Column({ name: 'source_material_id', type: 'bigint' })
  sourceMaterialId: string;

  @Column({ name: 'target_material_id', type: 'bigint' })
  targetMaterialId: string;

  @Column({ name: 'source_quantity', type: 'numeric', precision: 18, scale: 4 })
  sourceQuantity: string;

  @Column({ name: 'pieces_per_unit', type: 'integer' })
  piecesPerUnit: number;

  @Column({ name: 'scrap_quantity', type: 'integer', default: 0 })
  scrapQuantity: number;

  @Column({ name: 'output_quantity', type: 'numeric', precision: 18, scale: 4 })
  outputQuantity: string;

  @Column({ name: 'packing_quantity', type: 'integer' })
  packingQuantity: number;

  @Column({ name: 'source_packages', type: 'jsonb' })
  sourcePackages: ProcessingSourcePackage[];

  @Column({ type: 'text', nullable: true })
  remark: string | null;

  @Column({ name: 'created_by', type: 'bigint' })
  createdBy: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;
}
