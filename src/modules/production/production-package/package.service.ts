import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { qrSvgDataUrl } from '../../../common/qr-svg';
import { recordAuditEvent } from '../../../common/stock-ledger';
import { productionDayOf } from '../domain/production-day';
import { packageQrCode, splitIntoBoxes } from '../domain/packing';
import { ProductionLot } from '../entities/production-lot.entity';
import {
  ProductionPackage,
  ProductionPackageSource,
} from '../entities/production-package.entity';
import { ProductionTransaction } from '../entities/production-transaction.entity';
import { lockLotModelLine } from '../production-process/line-context';
import { LotService } from '../production-lot/lot.service';
import { LedgerService } from '../production-transaction/ledger.service';
import { GeneratePackagesDto } from './dto/generate-packages.dto';

export interface PackageView {
  id: string;
  qrCode: string;
  /** data: URL of the box's QR image (SVG). */
  qrImage: string;
  boxNo: number;
  unitType: 'FULL' | 'PARTIAL';
  initialQty: number;
  currentQty: number;
  status: string;
  origins: Array<{ lotNo: string; productionDate: string; qty: number }>;
}

export interface GeneratePackagesResult {
  replayed: boolean;
  fgLot: {
    id: string;
    lotNo: string;
    producedQty: number;
    remainingQty: number;
  };
  packages: PackageView[];
}

@Injectable()
export class PackageService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly lots: LotService,
    private readonly ledger: LedgerService,
  ) {}

  /**
   * Packs pieces of an FG/STORE lot into boxes: full boxes of the pack size
   * then one partial box. Each box takes its pieces' origins from the lot
   * (oldest origin first) and stores them as its own composition, so a scan
   * shows exactly which first-step lots the box holds. One transaction with
   * the PACKING ledger rows and the audit event.
   */
  async generate(
    dto: GeneratePackagesDto,
    userId: string,
  ): Promise<GeneratePackagesResult> {
    return this.dataSource.transaction(async (manager) => {
      const peek = await manager
        .getRepository(ProductionLot)
        .findOne({ where: { id: dto.fgLotId } });
      if (!peek) throw new NotFoundException(`ไม่พบ Lot id ${dto.fgLotId}`);
      // Same lock order as produce/transfer: line first, then the lot.
      const { line, order } = await lockLotModelLine(
        manager,
        peek.productionOrderLineId,
      );
      const lot = await manager.getRepository(ProductionLot).findOneOrFail({
        where: { id: dto.fgLotId },
        lock: { mode: 'pessimistic_write' },
      });
      if (lot.lotType !== 'FG' && lot.lotType !== 'STORE') {
        throw new ConflictException(
          'แพ็กกล่องได้เฉพาะ Lot ที่รับเข้าแล้ว (FG / คลังอะไหล่)',
        );
      }

      const replay = await manager.getRepository(ProductionTransaction).find({
        where: {
          requestId: dto.requestId,
          sourceLotId: lot.id,
          transactionType: 'PACKING',
        },
        order: { id: 'ASC' },
      });
      if (replay.length) {
        return this.result(
          manager,
          lot,
          replay.map((t) => t.packageId!),
          true,
        );
      }

      const qty = dto.qty ?? lot.remainingQty;
      if (qty < 1 || qty > lot.remainingQty) {
        throw new ConflictException(
          `จำนวนที่จะแพ็กเกินยอดที่ยังไม่แพ็ก (เหลือ ${lot.remainingQty} ชิ้น)`,
        );
      }
      const packSize =
        dto.packSize ?? (line.packingQuantity > 0 ? line.packingQuantity : qty);
      const boxes = splitIntoBoxes(qty, packSize);

      const last = (await manager.query(
        `SELECT COALESCE(MAX(box_no), 0)::int AS last_no
         FROM inventory.production_packages WHERE fg_lot_id = $1`,
        [lot.id],
      )) as unknown as Array<{ last_no: number }>;
      let boxNo = last[0].last_no;
      const day = productionDayOf(new Date());
      const packageRepo = manager.getRepository(ProductionPackage);
      const created: string[] = [];

      for (const boxQty of boxes) {
        boxNo += 1;
        const origins = await this.lots.takeOrigins(manager, lot.id, boxQty);
        const pkg = await packageRepo.save(
          packageRepo.create({
            qrCode: packageQrCode(lot.lotNo, boxNo),
            productionOrderId: order.id,
            productionOrderLineId: line.id,
            productId: lot.productId,
            fgLotId: lot.id,
            boxNo,
            unitType: boxQty < packSize ? 'PARTIAL' : 'FULL',
            initialQty: boxQty,
            currentQty: boxQty,
            status: 'PACKED',
            createdBy: userId,
          }),
        );
        await manager.getRepository(ProductionPackageSource).insert(
          origins.map((o) => ({
            packageId: pkg.id,
            originLotId: o.originLotId,
            qty: o.qty,
          })),
        );
        await this.ledger.write(
          manager,
          {
            requestId: dto.requestId,
            productionOrderId: order.id,
            productionOrderLineId: line.id,
            stepIndex: lot.stepIndex,
            processStepId: lot.processStepId,
            transactionType: 'PACKING',
            sourceLotId: lot.id,
            packageId: pkg.id,
            qty: boxQty,
            transactionDate: day.productionDate,
            shiftKey: day.shift,
            operatorId: userId,
          },
          origins,
        );
        created.push(pkg.id);
      }

      lot.remainingQty -= qty;
      if (lot.remainingQty === 0) lot.status = 'CONSUMED';
      await manager.getRepository(ProductionLot).save(lot);

      await recordAuditEvent(manager, {
        traceId: lot.lotNo,
        action: 'CREATE',
        eventName: 'production.package.generated',
        targetType: 'PRODUCTION_PACKAGE',
        targetId: lot.id,
        performedBy: userId,
        requestId: dto.requestId,
        after: {
          lotNo: lot.lotNo,
          productionOrder: order.code,
          qty,
          packSize,
          boxes: boxes.length,
          firstBox: packageQrCode(lot.lotNo, boxNo - boxes.length + 1),
          lastBox: packageQrCode(lot.lotNo, boxNo),
        },
      });

      return this.result(manager, lot, created, false);
    });
  }

  /** Boxes of an FG/STORE lot, in box order. */
  async listByLot(lotId: string): Promise<PackageView[]> {
    const rows = await this.dataSource
      .getRepository(ProductionPackage)
      .find({ where: { fgLotId: lotId }, order: { boxNo: 'ASC' } });
    return this.views(
      this.dataSource.manager,
      rows.map((r) => r.id),
    );
  }

  private async result(
    manager: EntityManager,
    lot: ProductionLot,
    packageIds: string[],
    replayed: boolean,
  ): Promise<GeneratePackagesResult> {
    const fresh = await manager
      .getRepository(ProductionLot)
      .findOneOrFail({ where: { id: lot.id } });
    return {
      replayed,
      fgLot: {
        id: fresh.id,
        lotNo: fresh.lotNo,
        producedQty: fresh.producedQty,
        remainingQty: fresh.remainingQty,
      },
      packages: await this.views(manager, packageIds),
    };
  }

  private async views(
    manager: EntityManager,
    packageIds: string[],
  ): Promise<PackageView[]> {
    if (!packageIds.length) return [];
    const packages = await manager
      .getRepository(ProductionPackage)
      .createQueryBuilder('p')
      .where('p.id IN (:...ids)', { ids: packageIds })
      .orderBy('p.boxNo', 'ASC')
      .getMany();
    const sources = (await manager.query(
      `SELECT s.package_id, l.lot_no, l.production_date::text AS production_date, s.qty
       FROM inventory.production_package_sources s
       JOIN inventory.production_lots l ON l.id = s.origin_lot_id
       WHERE s.package_id = ANY($1::bigint[])
       ORDER BY l.production_date, l.id`,
      [packageIds],
    )) as unknown as Array<{
      package_id: string;
      lot_no: string;
      production_date: string;
      qty: number;
    }>;
    return Promise.all(
      packages.map(async (p) => ({
        id: p.id,
        qrCode: p.qrCode,
        qrImage: await qrSvgDataUrl(p.qrCode),
        boxNo: p.boxNo,
        unitType: p.unitType,
        initialQty: p.initialQty,
        currentQty: p.currentQty,
        status: p.status,
        origins: sources
          .filter((s) => String(s.package_id) === String(p.id))
          .map((s) => ({
            lotNo: s.lot_no,
            productionDate: s.production_date,
            qty: Number(s.qty),
          })),
      })),
    );
  }
}
