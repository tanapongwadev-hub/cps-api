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

/**
 * QR Payload สำหรับชุดจำนวนชิ้นที่ใช้ได้ (piecesQuantity)
 * ใช้สำหรับ material_type = PIPE / SHEET / COIL เท่านั้น
 * อ้างอิง internalLotNo + runNo เดียวกันกับ QR หลัก แต่ payload มี piecesQuantity
 */
export interface PiecesQrPayload {
  version: string;
  internalLotNo: string;
  runNo: string | null;
  materialCode: string;
  piecesQuantity: string;
  materialType: string;
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

  /** เลขที่ PO — header ของเอกสาร (optional) */
  @Index()
  @Column({ name: 'po_no', type: 'varchar', length: 30, nullable: true })
  poNo: string | null;

  /**
   * Snapshot of material.materialType at the time of receiving
   * (PCS / PIPE / SHEET / COIL). Used to decide how `piecesQuantity` is computed.
   */
  @Column({ name: 'material_type', type: 'varchar', length: 20, nullable: true })
  materialType: string | null;

  /**
   * Snapshot of material.ratio at the time of receiving.
   * Required when materialType is PIPE / SHEET / COIL.
   */
  @Column({ name: 'ratio', type: 'integer', nullable: true })
  ratio: number | null;

  /**
   * จำนวนชิ้นที่ใช้ได้จริง:
   *   - PCS  → null
   *   - PIPE / SHEET / COIL → receive_quantity * ratio
   * เก็บทั้ง receive_quantity (ต้นทาง) และ pieces_quantity (ชิ้นที่ใช้ได้)
   * เพื่อรองรับการ reconcile ยอดภายหลัง
   */
  @Column({
    name: 'pieces_quantity',
    type: 'numeric',
    precision: 18,
    scale: 4,
    nullable: true,
  })
  piecesQuantity: string | null;

  /**
   * QR Code ชุดที่ 2 สำหรับ piecesQuantity
   * ใช้สำหรับ material_type = PIPE / SHEET / COIL เท่านั้น
   * อ้างอิง internalLotNo + runNo เดียวกันกับ QR หลัก
   */
  @Column({ name: 'pieces_qr_code', type: 'text', nullable: true })
  piecesQrCode: string | null;

  /**
   * Payload ของ pieces QR Code (JSON)
   * เก็บข้อมูลเพิ่มเติม: runNo, materialType, piecesQuantity
   */
  @Column({ name: 'pieces_qr_payload', type: 'jsonb', nullable: true })
  piecesQrPayload: PiecesQrPayload | null;

  /** Path ของไฟล์แนบ (รูปภาพ / เอกสาร PO) — optional */
  @Column({ name: 'attachment_url', type: 'varchar', length: 500, nullable: true })
  attachmentUrl: string | null;

  /** ชื่อไฟล์เดิมของไฟล์แนบ */
  @Column({ name: 'attachment_name', type: 'varchar', length: 255, nullable: true })
  attachmentName: string | null;

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
