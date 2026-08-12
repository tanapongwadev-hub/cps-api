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
import { Material } from '../master/material.entity';
import { Organization } from '../master/organization.entity';
import { Supplier } from '../master/supplier.entity';
import { Unit } from '../master/unit.entity';
import { MaterialReceivingPackage } from './material-receiving-package.entity';

export const MATERIAL_RECEIVING_STATUSES = [
  'draft',
  'confirmed',
  'cancelled',
] as const;

export type MaterialReceivingStatus =
  (typeof MATERIAL_RECEIVING_STATUSES)[number];

/**
 * โครงสร้างข้อมูลที่ฝังใน QR Code (version 1.0)
 * version ช่วยให้ frontend/client รู้ว่า payload นี้ใช้ schema ไหน
 */
export interface QrPayload {
  version: string;
  internalLotNo: string;
  materialCode: string;
  receiveQuantity: string;
  supplierLotNo: string | null;
}

@Entity('material_receivings', { schema: 'inventory' })
@Index(['internalLotNo'], { unique: true })
export class MaterialReceiving {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'run_no', type: 'varchar', length: 20, nullable: true })
  runNo: string | null;

  @Column({ name: 'internal_lot_no', type: 'varchar', length: 30 })
  internalLotNo: string;

  @Index()
  @Column({ name: 'organization_id', type: 'bigint' })
  organizationId: string;

  @Index()
  @Column({ name: 'supplier_id', type: 'bigint' })
  supplierId: string;

  @Index()
  @Column({ name: 'material_id', type: 'bigint' })
  materialId: string;

  @Column({ name: 'unit_id', type: 'bigint' })
  unitId: string;

  @Column({
    name: 'receive_quantity',
    type: 'numeric',
    precision: 18,
    scale: 4,
  })
  receiveQuantity: string;

  @Column({ name: 'packing_quantity', type: 'integer' })
  packingQuantity: number;

  @Column({ name: 'package_count', type: 'integer' })
  packageCount: number;

  @Column({
    name: 'supplier_lot_no',
    type: 'varchar',
    length: 30,
    nullable: true,
  })
  supplierLotNo: string | null;

  @Column({
    name: 'supplier_production_date',
    type: 'date',
    nullable: true,
  })
  supplierProductionDate: string | null;

  @Index()
  @Column({ name: 'receive_date', type: 'date' })
  receiveDate: string;

  @Column({ name: 'qr_code', type: 'text', nullable: true })
  qrCode: string | null;

  @Column({ name: 'qr_payload', type: 'jsonb', nullable: true })
  qrPayload: QrPayload | null;

  @Index()
  @Column({ type: 'varchar', length: 20, default: 'draft' })
  status: MaterialReceivingStatus;

  @Column({
    name: 'idempotency_key',
    type: 'varchar',
    length: 80,
    nullable: true,
  })
  idempotencyKey: string | null;

  @Column({ type: 'text', nullable: true })
  remark: string | null;

  @Column({ name: 'confirmed_by', type: 'bigint', nullable: true })
  confirmedBy: string | null;

  @Column({ name: 'confirmed_at', type: 'timestamp', nullable: true })
  confirmedAt: Date | null;

  @Column({ name: 'cancelled_by', type: 'bigint', nullable: true })
  cancelledBy: string | null;

  @Column({ name: 'cancelled_at', type: 'timestamp', nullable: true })
  cancelledAt: Date | null;

  @Column({ name: 'cancel_reason', type: 'text', nullable: true })
  cancelReason: string | null;

  @Column({ name: 'created_by', type: 'bigint', nullable: true })
  createdBy: string | null;

  @Column({ name: 'updated_by', type: 'bigint', nullable: true })
  updatedBy: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;

  @ManyToOne(() => Organization, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @ManyToOne(() => Supplier, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'supplier_id' })
  supplier: Supplier;

  @ManyToOne(() => Material, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'material_id' })
  material: Material;

  @ManyToOne(() => Unit, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'unit_id' })
  unit: Unit;

  @OneToMany(() => MaterialReceivingPackage, (pkg) => pkg.materialReceiving, {
    cascade: false,
  })
  packages: MaterialReceivingPackage[];
}
