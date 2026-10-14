import { ConflictException, Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { getBangkokDate } from '../../common/business-date';
import { qrSvgDataUrl } from '../../common/qr-svg';
import { MaterialReceivingPackage } from '../../entities/inventory/material-receiving-package.entity';
import { Material, MaterialLocationType, MaterialShape } from '../../entities/master/material.entity';
import { MaterialsReceivingService } from '../materials-receiving/materials-receiving.service';
import { ProductionOrderLine } from '../production-orders/production-order.entity';

/** Receives only completed boxes, in the same transaction as their production movement. */
@Injectable()
export class MaterialProductionReceiptService {
  constructor(private readonly receiving: MaterialsReceivingService) {}

  async receiveBox(
    manager: EntityManager,
    line: ProductionOrderLine,
    sourceKind: 'LOT_PACKAGE' | 'PACKET',
    sourceId: string,
    qrCode: string,
    quantity: number,
    productionDate: string,
    userId: string,
  ): Promise<void> {
    if (!line.materialId) return;
    if (!Number.isSafeInteger(quantity) || quantity <= 0) {
      throw new ConflictException('จำนวนผลผลิตที่รับเข้าต้องเป็นจำนวนเต็มมากกว่า 0');
    }
    const existing = await manager.query(
      `SELECT id FROM inventory.production_material_receipts WHERE source_kind=$1 AND source_id=$2`,
      [sourceKind, sourceId],
    );
    if (existing.length) return;
    // Serialize even the first receipt, when no stock-balance row exists yet.
    const material = await manager.getRepository(Material).findOneOrFail({
      where: { id: line.materialId }, lock: { mode: 'pessimistic_write' },
    });
    if (!material.isActive || material.locationType !== MaterialLocationType.INTERNAL ||
      [MaterialShape.PIPE, MaterialShape.SHEET, MaterialShape.COIL].includes(material.materialType!)) {
      throw new ConflictException('ปลายทางผลผลิตต้องเป็นวัตถุดิบภายในที่เปิดใช้งานและไม่ใช่วัตถุดิบดิบ');
    }
    const orders = await manager.query(
      'SELECT code FROM inventory.production_orders WHERE id=$1', [line.productionOrderId],
    );
    const output = await this.receiving.receiveProductionWithManager(manager, line.id, {
      materialId: line.materialId,
      receiveQuantity: String(quantity),
      packingQuantityOverride: quantity,
      receiveDate: getBangkokDate(),
      supplierProductionDate: productionDate,
      remark: `ผลผลิตจากใบสั่งผลิต ${line.productionOrderId} รายการ ${line.lineNo} · ${qrCode}`,
    }, userId, orders[0]?.code ?? line.productionOrderId);
    const pkg = await manager.getRepository(MaterialReceivingPackage).findOneOrFail({
      where: { materialReceivingId: output.id, packageNo: 1 },
    });
    // The shop-floor label is also the stock SUB QR, so the next plan can scan/issue it.
    pkg.lotDetailNo = qrCode;
    pkg.qrCode = await qrSvgDataUrl(qrCode);
    await manager.getRepository(MaterialReceivingPackage).save(pkg);
    await manager.query(`INSERT INTO inventory.production_material_receipts
      (production_order_line_id,source_kind,source_id,material_receiving_id,material_receiving_package_id)
      VALUES ($1,$2,$3,$4,$5)`, [line.id, sourceKind, sourceId, output.id, pkg.id]);
  }
}
