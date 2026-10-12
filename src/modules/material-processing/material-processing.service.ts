import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { createTraceId, recordAuditEvent, recordStockMovement } from '../../common/stock-ledger';
import { getBangkokDate } from '../../common/business-date';
import { MaterialProcessing, ProcessingSourcePackage } from '../../entities/inventory/material-processing.entity';
import { MaterialReceiving } from '../../entities/inventory/material-receiving.entity';
import { MaterialReceivingPackage } from '../../entities/inventory/material-receiving-package.entity';
import { StockBalance } from '../../entities/inventory/stock-balance.entity';
import { Material } from '../../entities/master/material.entity';
import { MaterialsReceivingService } from '../materials-receiving/materials-receiving.service';
import { CreateMaterialProcessingDto, ListMaterialProcessingDto } from './material-processing.dto';

const RAW_SHAPES = ['PIPE', 'SHEET', 'COIL'];
const scaled = (quantity: string): bigint => {
  const [whole, fraction = ''] = quantity.split('.');
  return BigInt(whole) * 10000n + BigInt(fraction.padEnd(4, '0').slice(0, 4));
};
const decimal = (quantity: bigint): string => `${quantity / 10000n}.${(quantity % 10000n).toString().padStart(4, '0')}`;

export function calculateProcessingOutput(sourceQuantity: number, piecesPerUnit: number, scrapQuantity: number, packingQuantity: number) {
  if (![sourceQuantity, piecesPerUnit, packingQuantity].every((n) => Number.isSafeInteger(n) && n > 0) ||
      !Number.isSafeInteger(scrapQuantity) || scrapQuantity < 0) {
    throw new BadRequestException('จำนวนแปรรูป อัตราตัด และจำนวนบรรจุต้องเป็นจำนวนเต็มบวก');
  }
  const expectedQuantity = sourceQuantity * piecesPerUnit;
  const outputQuantity = expectedQuantity - scrapQuantity;
  if (!Number.isSafeInteger(expectedQuantity) || expectedQuantity > 1000000000 || outputQuantity <= 0) {
    throw new BadRequestException('จำนวนชิ้นดีต้องมากกว่า 0 และจำนวนชิ้นทั้งหมดไม่เกิน 1,000,000,000');
  }
  const packageCount = Math.ceil(outputQuantity / packingQuantity);
  if (packageCount > 5000) throw new BadRequestException('หนึ่งใบแปรรูปสร้างได้ไม่เกิน 5,000 กล่อง');
  return { expectedQuantity, outputQuantity, packageCount };
}

@Injectable()
export class MaterialProcessingService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource, private readonly receivingService: MaterialsReceivingService) {}

  async list(query: ListMaterialProcessingDto) {
    // Filter BEFORE pagination; availability excludes hard FIFO reservations.
    const cte = `WITH queue AS (
      SELECT r.id, r.internal_lot_no AS "internalLotNo", r.material_id AS "materialId",
        m.code AS "materialCode", m.name AS "materialName", r.material_type AS "materialType",
        COALESCE(u.symbol,u.code) AS unit, r.receive_date AS "receiveDate",
        r.receive_quantity::text AS "receiveQuantity", r.processed_quantity::text AS "processedQuantity",
        COALESCE(stock.remaining,0)::text AS "remainingQuantity",
        COALESCE(stock.available,0)::text AS "availableQuantity",
        COALESCE(r.pieces_quantity,r.receive_quantity) = r.receive_quantity AS "canProcessUnits",
        CASE WHEN r.processed_quantity = 0 THEN 'WAITING'
          WHEN r.processed_quantity >= r.receive_quantity THEN 'PROCESSED' ELSE 'PARTIAL' END AS "processingStatus"
      FROM inventory.material_receivings r
      JOIN master.materials m ON m.id = r.material_id
      JOIN master.units u ON u.id = r.unit_id
      LEFT JOIN LATERAL (
        SELECT SUM(p.remaining_quantity) AS remaining,
          SUM(GREATEST(p.remaining_quantity-COALESCE(res.quantity,0),0)) AS available
        FROM inventory.material_receiving_packages p
        LEFT JOIN LATERAL (
          SELECT SUM(reserved_quantity-issued_quantity) AS quantity
          FROM inventory.production_plan_reservations
          WHERE material_receiving_package_id=p.id AND released_at IS NULL
        ) res ON TRUE
        WHERE p.material_receiving_id=r.id AND p.status IN ('in_stock','partial')
      ) stock ON TRUE
      WHERE r.status='confirmed' AND r.material_type IN ('PIPE','SHEET','COIL') AND r.source_receiving_id IS NULL
    ), filtered AS (SELECT * FROM queue WHERE
      ($1::text IS NULL OR "internalLotNo" ILIKE $1 OR "materialCode" ILIKE $1 OR "materialName" ILIKE $1)
      AND ($2::text IS NULL OR "processingStatus"=$2))`;
    const search = query.search?.trim() ? `%${query.search.trim()}%` : null;
    const params = [search, query.status ?? null];
    const totals: { total: string }[] = await this.dataSource.query(`${cte} SELECT COUNT(*)::text AS total FROM filtered`, params);
    const totalItems = Number(totals[0].total);
    const totalPages = Math.max(1, Math.ceil(totalItems / query.limit));
    const page = Math.min(query.page, totalPages);
    const items: unknown[] = await this.dataSource.query(`${cte} SELECT * FROM filtered ORDER BY "receiveDate" DESC,id DESC LIMIT $3 OFFSET $4`, [...params, query.limit, (page - 1) * query.limit]);
    return { items, meta: { page, totalPages, totalItems, limit: query.limit } };
  }

  lookups() { return this.receivingService.getMaterialLookups(); }

  async history(id: string) {
    if (!/^[1-9]\d*$/.test(id)) throw new BadRequestException('รหัสรับเข้าไม่ถูกต้อง');
    return this.dataSource.query(`SELECT p.id,p.code,p.source_quantity::text AS "sourceQuantity",
      p.pieces_per_unit AS "piecesPerUnit",p.scrap_quantity AS "scrapQuantity",
      p.output_quantity::text AS "outputQuantity",p.packing_quantity AS "packingQuantity",
      p.source_packages AS "sourcePackages",p.created_at AS "createdAt",p.remark,
      p.output_receiving_id AS "outputReceivingId",r.internal_lot_no AS "outputLotNo",r.package_count AS "packageCount",
      m.code AS "targetMaterialCode",m.name AS "targetMaterialName"
      FROM inventory.material_processings p JOIN inventory.material_receivings r ON r.id=p.output_receiving_id
      JOIN master.materials m ON m.id=p.target_material_id WHERE p.source_receiving_id=$1 ORDER BY p.id DESC`, [id]);
  }

  async output(id: string) {
    if (!/^[1-9]\d*$/.test(id)) throw new BadRequestException('รหัสรับเข้าไม่ถูกต้อง');
    const processing = await this.dataSource.getRepository(MaterialProcessing).findOne({ where: { outputReceivingId: id } });
    if (!processing) throw new NotFoundException('ไม่พบล็อตหลังแปรรูป');
    return this.receivingService.findOne(id);
  }

  async process(dto: CreateMaterialProcessingDto, userId: string) {
    const calculation = calculateProcessingOutput(dto.sourceQuantity, dto.piecesPerUnit, dto.scrapQuantity, dto.packingQuantity);
    return this.dataSource.transaction(async (manager) => {
      // A retried submit has one result, even if the first response was lost.
      await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`material-processing:${dto.requestKey}`]);
      const processRepo = manager.getRepository(MaterialProcessing);
      const previous = await processRepo.findOne({ where: { requestKey: dto.requestKey } });
      if (previous) {
        if (previous.createdBy !== userId || previous.sourceReceivingId !== dto.sourceReceivingId ||
            previous.targetMaterialId !== dto.targetMaterialId || Number(previous.sourceQuantity) !== dto.sourceQuantity ||
            previous.piecesPerUnit !== dto.piecesPerUnit || previous.scrapQuantity !== dto.scrapQuantity ||
            previous.packingQuantity !== dto.packingQuantity || previous.remark !== (dto.remark?.trim() || null)) {
          throw new ConflictException('คำขอนี้ถูกใช้กับใบแปรรูปอื่นแล้ว กรุณาเปิดแบบฟอร์มใหม่');
        }
        return previous;
      }
      const receivingRepo = manager.getRepository(MaterialReceiving);
      const source = await receivingRepo.findOne({ where: { id: dto.sourceReceivingId }, lock: { mode: 'pessimistic_write' } });
      if (!source) throw new NotFoundException('ไม่พบรายการรับเข้าต้นทาง');
      if (source.status !== 'confirmed' || source.sourceReceivingId || !RAW_SHAPES.includes(source.materialType ?? '')) {
        throw new ConflictException('แปรรูปได้เฉพาะรายการรับเข้า PIPE/SHEET/COIL ที่ยืนยันแล้ว');
      }
      if (scaled(source.piecesQuantity ?? source.receiveQuantity) !== scaled(source.receiveQuantity)) {
        throw new ConflictException('ล็อตเดิมนี้เคยแปลงหน่วยด้วย Ratio ต้องกระทบยอดหน่วยก่อนแปรรูป');
      }
      if (source.materialId === dto.targetMaterialId) throw new BadRequestException('Material ปลายทางต้องแยกจากต้นทาง');
      const target = await manager.getRepository(Material).findOne({ where: { id: dto.targetMaterialId, isActive: true } });
      if (!target) throw new BadRequestException('Material ปลายทางต้องเปิดใช้งาน');
      const packageRepo = manager.getRepository(MaterialReceivingPackage);
      const packages = await packageRepo.createQueryBuilder('pkg').where('pkg.materialReceivingId=:id', { id: source.id })
        .andWhere('pkg.status IN (:...statuses)', { statuses: ['in_stock', 'partial'] })
        .orderBy('pkg.packageNo', 'ASC').setLock('pessimistic_write').getMany();
      const reservations: { package_id: string; quantity: string }[] = packages.length ? await manager.query(
        `SELECT material_receiving_package_id AS package_id,SUM(reserved_quantity-issued_quantity)::text AS quantity
         FROM inventory.production_plan_reservations WHERE released_at IS NULL
         AND material_receiving_package_id=ANY($1::bigint[]) GROUP BY material_receiving_package_id`, [packages.map((p) => p.id)]) : [];
      const reserved = new Map(reservations.map((r) => [String(r.package_id), scaled(r.quantity)]));
      const available = (p: MaterialReceivingPackage) => {
        const value = scaled(p.remainingQuantity) - (reserved.get(p.id) ?? 0n);
        return value > 0n ? value : 0n;
      };
      const requested = BigInt(dto.sourceQuantity) * 10000n;
      if (scaled(source.processedQuantity ?? '0') + requested > scaled(source.receiveQuantity)) {
        throw new ConflictException('จำนวนแปรรูปเกินจำนวนรับเข้าต้นทางที่ยังไม่แปรรูป');
      }
      const totalAvailable = packages.reduce((sum, p) => sum + available(p), 0n);
      if (totalAvailable < requested) throw new ConflictException(`วัตถุดิบพร้อมแปรรูปไม่พอ คงเหลือที่ไม่ถูกจอง ${decimal(totalAvailable)}`);
      const balanceRepo = manager.getRepository(StockBalance);
      // Stable ordering and insert-on-conflict cover concurrent first receipts.
      for (const materialId of [source.materialId, target.id].sort((a,b) => BigInt(a) < BigInt(b) ? -1 : 1)) {
        await balanceRepo.createQueryBuilder().insert().values({ materialId, quantity: '0' }).orIgnore().execute();
        await balanceRepo.findOneOrFail({ where: { materialId }, lock: { mode: 'pessimistic_write' } });
      }
      const balance = await balanceRepo.findOneOrFail({ where: { materialId: source.materialId } });
      if (scaled(balance.quantity) < requested) throw new ConflictException('สต็อกต้นทางไม่ตรงกับจำนวนในล็อต กรุณากระทบยอดก่อน');
      const traceId = createTraceId('ADJ');
      const consumed: ProcessingSourcePackage[] = [];
      let outstanding = requested;
      let running = scaled(balance.quantity);
      for (const pkg of packages) {
        if (outstanding === 0n) break;
        const quantity = available(pkg) < outstanding ? available(pkg) : outstanding;
        if (quantity === 0n) continue;
        const before = running;
        running -= quantity;
        outstanding -= quantity;
        pkg.remainingQuantity = decimal(scaled(pkg.remainingQuantity) - quantity);
        pkg.status = scaled(pkg.remainingQuantity) === 0n ? 'issued' : 'partial';
        await packageRepo.save(pkg);
        consumed.push({ packageId: pkg.id, lotDetailNo: pkg.lotDetailNo, quantity: decimal(quantity) });
        await recordStockMovement(manager, {
          traceId, transactionType: 'ISSUE', materialId: source.materialId,
          referenceType: 'MATERIAL_RECEIVING', referenceId: source.id, referenceLotNo: source.internalLotNo,
          mainQrId: source.id, subQrId: pkg.id, unitId: source.unitId,
          quantityBefore: decimal(before), quantityIn: '0.0000', quantityOut: decimal(quantity), quantityAfter: decimal(running),
          remark: 'ใช้วัตถุดิบเพื่อแปรรูป', performedBy: userId,
        });
      }
      balance.quantity = decimal(running);
      balance.lastMovementAt = new Date();
      await balanceRepo.save(balance);
      const receiveDate = getBangkokDate();
      const output = await this.receivingService.receiveProcessedWithManager(manager, source, {
        materialId: target.id, receiveQuantity: String(calculation.outputQuantity),
        packingQuantityOverride: dto.packingQuantity,
        supplierProductionDate: source.supplierProductionDate ?? source.receiveDate, receiveDate,
        remark: `แปรรูปจาก ${source.internalLotNo}${dto.remark?.trim() ? ` · ${dto.remark.trim()}` : ''}`,
      }, userId);
      const processing = await processRepo.save(processRepo.create({
        requestKey: dto.requestKey, code: `MP-${output.internalLotNo}`,
        sourceReceivingId: source.id, outputReceivingId: output.id,
        sourceMaterialId: source.materialId, targetMaterialId: target.id,
        sourceQuantity: decimal(requested), piecesPerUnit: dto.piecesPerUnit, scrapQuantity: dto.scrapQuantity,
        outputQuantity: String(calculation.outputQuantity), packingQuantity: dto.packingQuantity,
        sourcePackages: consumed, remark: dto.remark?.trim() || null, createdBy: userId,
      }));
      source.processedQuantity = decimal(scaled(source.processedQuantity ?? '0') + requested);
      source.updatedBy = userId;
      await receivingRepo.save(source);
      await recordAuditEvent(manager, {
        traceId, action: 'COMPLETE', eventName: 'material_processing.completed', targetType: 'MATERIAL_PROCESSING',
        targetId: processing.id, performedBy: userId,
        after: { code: processing.code, sourceReceivingId: source.id, outputReceivingId: output.id,
          sourceMaterialId: source.materialId, targetMaterialId: target.id, sourceQuantity: processing.sourceQuantity,
          outputQuantity: processing.outputQuantity, scrapQuantity: processing.scrapQuantity, packageCount: calculation.packageCount },
      });
      return processing;
    });
  }
}
