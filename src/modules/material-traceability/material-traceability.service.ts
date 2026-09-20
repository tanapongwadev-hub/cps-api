import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository, SelectQueryBuilder } from 'typeorm';
import { Department } from '../../entities/iam/department.entity';
import { User } from '../../entities/iam/user.entity';
import { MaterialReceivingPackage } from '../../entities/inventory/material-receiving-package.entity';
import { MaterialReceiving } from '../../entities/inventory/material-receiving.entity';
import { StockBalance } from '../../entities/inventory/stock-balance.entity';
import { StockTransaction } from '../../entities/inventory/stock-transaction.entity';
import { Material } from '../../entities/master/material.entity';
import { Supplier } from '../../entities/master/supplier.entity';
import { Unit } from '../../entities/master/unit.entity';
import { MaterialDisbursementPackage } from '../materials-disbursement/material-disbursement-package.entity';
import { MaterialDisbursementItem } from '../materials-disbursement/material-disbursement-item.entity';
import { MaterialsDisbursement } from '../materials-disbursement/materials-disbursement.entity';
import { QueryMaterialTraceabilityDto } from './dto/query-material-traceability.dto';

/** Raw-select column expressions shared by every movement-row query
 * (the paginated table AND every drill-down) so the two can never drift. */
const MOVEMENT_COLUMNS: Array<[string, string]> = [
  ['st.id', 'id'],
  ['st.transaction_no', 'transactionNo'],
  ['st.trace_id', 'traceId'],
  ['st.transaction_type', 'transactionType'],
  ['st.transaction_date', 'transactionDate'],
  ['st.reference_type', 'referenceType'],
  ['st.reference_id', 'referenceId'],
  ['st.reference_no', 'referenceNo'],
  ['st.reference_lot_no', 'referenceLotNo'],
  ['material.id', 'materialId'],
  ['material.code', 'materialCode'],
  ['material.name', 'materialName'],
  ['material.type', 'materialType'],
  ['material.material_type', 'shape'],
  ['mainQr.id', 'mainQrId'],
  ['mainQr.internal_lot_no', 'mainQrCode'],
  ['mainQr.supplier_lot_no', 'supplierLotNo'],
  ['subQr.id', 'subQrId'],
  ['subQr.lot_detail_no', 'subQrCode'],
  ['subQr.package_no', 'boxNo'],
  ['subQr.status', 'subQrStatus'],
  ['receivingDoc.id', 'receivingId'],
  ['receivingDoc.internal_lot_no', 'receivingNo'],
  ['receivingDoc.status', 'receivingStatus'],
  ['disbursementDoc.id', 'disbursementId'],
  ['disbursementDoc.disbursement_no', 'disbursementNo'],
  ['disbursementDoc.status', 'disbursementStatus'],
  ['st.quantity_before', 'quantityBefore'],
  ['st.quantity_in', 'quantityIn'],
  ['st.quantity_out', 'quantityOut'],
  ['st.quantity_after', 'quantityAfter'],
  ['unit.symbol', 'unitSymbol'],
  ['st.source_location_id', 'sourceLocationId'],
  ['st.destination_location_id', 'destinationLocationId'],
  ['supplier.id', 'supplierId'],
  ['supplier.name_th', 'supplierNameTh'],
  ['supplier.name_en', 'supplierNameEn'],
  ['department.id', 'departmentId'],
  ['department.name_th', 'departmentNameTh'],
  ['st.production_order', 'productionOrder'],
  ['st.created_by', 'performedById'],
  ['operatorUser.username', 'performedByUsername'],
  ['st.created_at', 'createdAt'],
  ['st.remark', 'remark'],
  ['st.reason', 'reason'],
];

export interface MovementRow {
  id: string;
  transactionNo: string;
  traceId: string;
  transactionType: string;
  transactionDate: Date;
  referenceType: string;
  referenceId: string | null;
  referenceNo: string | null;
  referenceLotNo: string | null;
  materialId: string;
  materialCode: string;
  materialName: string;
  materialType: string | null;
  shape: string | null;
  mainQrId: string | null;
  mainQrCode: string | null;
  supplierLotNo: string | null;
  subQrId: string | null;
  subQrCode: string | null;
  boxNo: number | null;
  subQrStatus: string | null;
  receivingId: string | null;
  receivingNo: string | null;
  receivingStatus: string | null;
  disbursementId: string | null;
  disbursementNo: string | null;
  disbursementStatus: string | null;
  quantityBefore: string;
  quantityIn: string;
  quantityOut: string;
  quantityAfter: string;
  unitSymbol: string | null;
  sourceLocationId: string | null;
  destinationLocationId: string | null;
  supplierId: string | null;
  supplierNameTh: string | null;
  supplierNameEn: string | null;
  departmentId: string | null;
  departmentNameTh: string | null;
  productionOrder: string | null;
  performedById: string | null;
  performedByUsername: string | null;
  createdAt: Date;
  remark: string | null;
  reason: string | null;
}

export interface MaterialReconciliation {
  materialId: string;
  materialCode: string;
  ledgerBalance: string;
  stockBalance: string;
  isMatched: boolean;
}

const DECIMAL_SCALE = 4;
/**
 * Reconciliation is batched (see reconcileMaterials below): one grouped
 * ledger-sum query + one `stock_balances` query + one `materials` query for
 * every distinct material touched by the filtered result set, regardless of
 * how many materials that is — not one query per material as an earlier
 * version of this did. The cap here is now just a defensive ceiling against
 * a pathological unfiltered report matching an unreasonable number of
 * distinct materials in one page, not a real performance constraint.
 */
const MAX_RECONCILED_MATERIALS = 500;

@Injectable()
export class MaterialTraceabilityService {
  constructor(
    @InjectRepository(StockTransaction)
    private readonly stockTransactionRepository: Repository<StockTransaction>,
    @InjectRepository(StockBalance)
    private readonly stockBalanceRepository: Repository<StockBalance>,
    @InjectRepository(MaterialReceiving)
    private readonly receivingRepository: Repository<MaterialReceiving>,
    @InjectRepository(MaterialReceivingPackage)
    private readonly packageRepository: Repository<MaterialReceivingPackage>,
    @InjectRepository(MaterialsDisbursement)
    private readonly disbursementRepository: Repository<MaterialsDisbursement>,
    @InjectRepository(MaterialDisbursementPackage)
    private readonly disbursementPackageRepository: Repository<MaterialDisbursementPackage>,
    @InjectRepository(MaterialDisbursementItem)
    private readonly disbursementItemRepository: Repository<MaterialDisbursementItem>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  // ------------------------------------------------------------- main report

  async getReport(query: QueryMaterialTraceabilityDto) {
    const [summary, movements] = await Promise.all([
      this.getSummary(query),
      this.getMovements(query),
    ]);
    return { summary, ...movements };
  }

  async getMovements(query: QueryMaterialTraceabilityDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;

    const rowsQb = this.buildBaseQuery(query);
    this.applySelect(rowsQb);
    rowsQb
      .orderBy('st.transaction_date', 'DESC')
      .addOrderBy('st.id', 'DESC')
      .offset((page - 1) * limit)
      .limit(limit);

    const countQb = this.buildBaseQuery(query);

    const [raw, totalItems] = await Promise.all([
      rowsQb.getRawMany<MovementRow>(),
      countQb.getCount(),
    ]);

    return {
      items: raw.map((row) => this.toMovementResponse(row)),
      meta: {
        page,
        limit,
        totalItems,
        totalPages: Math.ceil(totalItems / limit) || 1,
      },
    };
  }

  async getSummary(query: QueryMaterialTraceabilityDto) {
    const qb = this.buildBaseQuery(query);
    const raw = await qb
      .select('COUNT(DISTINCT receivingDoc.id)', 'receivingCount')
      .addSelect('COUNT(DISTINCT disbursementDoc.id)', 'disbursementCount')
      .addSelect(
        "COALESCE(SUM(CASE WHEN st.transaction_type = 'RECEIVE' THEN st.quantity_in ELSE 0 END), 0)",
        'totalReceived',
      )
      .addSelect(
        "COALESCE(SUM(CASE WHEN st.transaction_type = 'ISSUE' THEN st.quantity_out ELSE 0 END), 0)",
        'totalIssued',
      )
      .addSelect('COUNT(DISTINCT mainQr.internal_lot_no)', 'lotCount')
      .addSelect('COUNT(DISTINCT st.main_qr_id)', 'mainQrCount')
      .addSelect('COUNT(DISTINCT st.sub_qr_id)', 'subQrCount')
      .addSelect(
        "COUNT(DISTINCT CASE WHEN subQr.status IN ('in_stock', 'partial') THEN subQr.id END)",
        'activeQrCount',
      )
      .addSelect(
        "COUNT(DISTINCT CASE WHEN subQr.status = 'issued' THEN subQr.id END)",
        'exhaustedQrCount',
      )
      .getRawOne<Record<string, string>>();

    const materialIdRows = await this.buildBaseQuery(query)
      .select('DISTINCT st.material_id', 'materialId')
      .limit(MAX_RECONCILED_MATERIALS)
      .getRawMany<{ materialId: string }>();
    const materialIds = materialIdRows.map((row) => row.materialId);

    const reconciliation = await this.reconcileMaterials(materialIds);
    const hasMismatch = reconciliation.some((r) => !r.isMatched);

    const totalReceived = raw?.totalReceived ?? '0';
    const totalIssued = raw?.totalIssued ?? '0';

    return {
      receivingCount: Number(raw?.receivingCount ?? 0),
      disbursementCount: Number(raw?.disbursementCount ?? 0),
      totalReceived,
      totalIssued,
      // "Current balance" here is the net of the filtered ledger slice
      // (RECEIVE+RETURN+ADJUST_IN+TRANSFER_IN minus ISSUE+ADJUST_OUT+
      // TRANSFER_OUT) — the authoritative live figure per material is in
      // `reconciliation[].stockBalance`, not this aggregate.
      currentBalance: this.fromScaled(
        this.toScaled(totalReceived) - this.toScaled(totalIssued),
      ),
      lotCount: Number(raw?.lotCount ?? 0),
      mainQrCount: Number(raw?.mainQrCount ?? 0),
      subQrCount: Number(raw?.subQrCount ?? 0),
      activeQrCount: Number(raw?.activeQrCount ?? 0),
      exhaustedQrCount: Number(raw?.exhaustedQrCount ?? 0),
      reconciliation,
      hasMismatch,
      reconciliationTruncated: materialIds.length >= MAX_RECONCILED_MATERIALS,
    };
  }

  /**
   * §11 "Running Balance": SUM(stock movement) must equal Current Stock, or
   * the report must visibly flag STOCK MISMATCH. Reconciles the FULL ledger
   * history for each material (not scoped to the report's date range — a
   * mismatch is a data-integrity question, not a "what happened this month"
   * one) against `stock_balances`, the authoritative live figure.
   *
   * Batched: exactly 3 queries total (grouped ledger sum, stock_balances,
   * materials — each `WHERE id IN (...)`) regardless of how many material
   * ids are passed, not one round-trip per material. `getSummary()` used to
   * call a single-material version of this in a `Promise.all(materialIds
   * .map(...))`, which meant N ledger queries + N balance queries + N
   * material lookups for N distinct materials in the filtered result — fine
   * for the handful of materials a typical filtered view touches, but an
   * unnecessary multiplier that this batched form removes outright, which
   * is also why the caller's `MAX_RECONCILED_MATERIALS` cap could be raised
   * from 25 to 500 (a defensive ceiling now, not a real constraint).
   */
  async reconcileMaterials(
    materialIds: string[],
  ): Promise<MaterialReconciliation[]> {
    if (materialIds.length === 0) return [];

    const [ledgerRows, balances, materials] = await Promise.all([
      this.stockTransactionRepository
        .createQueryBuilder('st')
        .select('st.material_id', 'materialId')
        .addSelect(
          'COALESCE(SUM(st.quantity_in), 0) - COALESCE(SUM(st.quantity_out), 0)',
          'balance',
        )
        .where('st.material_id IN (:...materialIds)', { materialIds })
        .groupBy('st.material_id')
        .getRawMany<{ materialId: string; balance: string }>(),
      this.stockBalanceRepository.find({
        where: { materialId: In(materialIds) },
      }),
      this.dataSource.getRepository(Material).find({
        where: { id: In(materialIds) },
      }),
    ]);

    const ledgerByMaterial = new Map(
      ledgerRows.map((row) => [row.materialId, row.balance]),
    );
    const balanceByMaterial = new Map(
      balances.map((b) => [b.materialId, b.quantity]),
    );
    const codeByMaterial = new Map(materials.map((m) => [m.id, m.code]));

    return materialIds.map((materialId) => {
      const ledgerBalance = this.fromScaled(
        this.toScaled(ledgerByMaterial.get(materialId) ?? '0'),
      );
      const stockBalance = balanceByMaterial.get(materialId) ?? '0.0000';
      return {
        materialId,
        materialCode: codeByMaterial.get(materialId) ?? '',
        ledgerBalance,
        stockBalance,
        isMatched: this.toScaled(ledgerBalance) === this.toScaled(stockBalance),
      };
    });
  }

  /** Single-material convenience wrapper over {@link reconcileMaterials}. */
  async reconcileMaterial(materialId: string): Promise<MaterialReconciliation> {
    const [result] = await this.reconcileMaterials([materialId]);
    return result;
  }

  // ---------------------------------------------------------------- QR trace

  /**
   * Scan-and-resolve for both MAIN and SUB QR — tries the SUB QR's
   * lot-detail-no first (the more specific identifier), falling back to a
   * MAIN QR (receiving) internal-lot-no match. Per §12 of the spec.
   */
  async traceByCode(code: string) {
    const pkg = await this.packageRepository.findOne({
      where: { lotDetailNo: code },
    });
    if (pkg) {
      return this.traceSubQr(pkg.id);
    }
    const receiving = await this.receivingRepository.findOne({
      where: { internalLotNo: code },
    });
    if (receiving) {
      return this.traceMainQr(receiving.id);
    }
    throw new NotFoundException(`No MAIN or SUB QR matches "${code}"`);
  }

  async traceMainQr(receivingId: string) {
    const receiving = await this.receivingRepository
      .createQueryBuilder('receiving')
      .leftJoinAndSelect('receiving.material', 'material')
      .leftJoinAndSelect('receiving.supplier', 'supplier')
      .leftJoinAndSelect('receiving.unit', 'unit')
      .where('receiving.id = :id', { id: receivingId })
      .getOne();
    if (!receiving) {
      throw new NotFoundException(
        `MAIN QR (receiving) ${receivingId} not found`,
      );
    }

    const packages = await this.packageRepository.find({
      where: { materialReceivingId: receivingId },
      order: { packageNo: 'ASC' },
    });

    const movements = await this.stockTransactionRepository.find({
      where: { mainQrId: receivingId },
      order: { transactionDate: 'ASC', id: 'ASC' },
    });

    const issueHistory = await this.subQrIssueHistory(
      packages.map((p) => p.id),
    );

    return {
      qrLevel: 'MAIN' as const,
      receiving: {
        id: receiving.id,
        traceId: receiving.traceId,
        internalLotNo: receiving.internalLotNo,
        supplierLotNo: receiving.supplierLotNo,
        receiveDate: receiving.receiveDate,
        receiveQuantity: receiving.receiveQuantity,
        convertedQuantity:
          receiving.piecesQuantity ?? receiving.receiveQuantity,
        status: receiving.status,
        material: receiving.material
          ? {
              id: receiving.material.id,
              code: receiving.material.code,
              name: receiving.material.name,
            }
          : null,
        supplier: receiving.supplier
          ? {
              id: receiving.supplier.id,
              nameTh: receiving.supplier.nameTh,
              nameEn: receiving.supplier.nameEn,
            }
          : null,
        unitSymbol: receiving.unit?.symbol ?? null,
        confirmedBy: receiving.confirmedBy,
        confirmedAt: receiving.confirmedAt,
        createdBy: receiving.createdBy,
        createdAt: receiving.createdAt,
      },
      packages: packages.map((p) => ({
        id: p.id,
        packageNo: p.packageNo,
        lotDetailNo: p.lotDetailNo,
        initialQuantity: p.quantity,
        currentQuantity: p.remainingQuantity,
        status: p.status,
      })),
      movements: movements.map((m) => this.toMovementSummary(m)),
      issueHistory,
      currentRemaining: this.fromScaled(
        packages.reduce(
          (sum, p) => sum + this.toScaled(p.remainingQuantity),
          0n,
        ),
      ),
    };
  }

  async traceSubQr(packageId: string) {
    const pkg = await this.packageRepository.findOne({
      where: { id: packageId },
    });
    if (!pkg) {
      throw new NotFoundException(`SUB QR (package) ${packageId} not found`);
    }
    const receiving = await this.receivingRepository
      .createQueryBuilder('receiving')
      .leftJoinAndSelect('receiving.material', 'material')
      .leftJoinAndSelect('receiving.supplier', 'supplier')
      .where('receiving.id = :id', { id: pkg.materialReceivingId })
      .getOne();

    const movements = await this.stockTransactionRepository.find({
      where: { subQrId: packageId },
      order: { transactionDate: 'ASC', id: 'ASC' },
    });
    const issueHistory = await this.subQrIssueHistory([packageId]);
    const adjustmentHistory = movements
      .filter(
        (m) =>
          m.transactionType === 'ADJUST_IN' ||
          m.transactionType === 'ADJUST_OUT',
      )
      .map((m) => this.toMovementSummary(m));

    return {
      qrLevel: 'SUB' as const,
      package: {
        id: pkg.id,
        packageNo: pkg.packageNo,
        lotDetailNo: pkg.lotDetailNo,
        initialQuantity: pkg.quantity,
        currentQuantity: pkg.remainingQuantity,
        status: pkg.status,
      },
      parentMainQr: receiving
        ? {
            id: receiving.id,
            internalLotNo: receiving.internalLotNo,
            material: receiving.material
              ? {
                  id: receiving.material.id,
                  code: receiving.material.code,
                  name: receiving.material.name,
                }
              : null,
            supplier: receiving.supplier
              ? {
                  id: receiving.supplier.id,
                  nameTh: receiving.supplier.nameTh,
                  nameEn: receiving.supplier.nameEn,
                }
              : null,
            receiveDate: receiving.receiveDate,
          }
        : null,
      movements: movements.map((m) => this.toMovementSummary(m)),
      issueHistory,
      adjustmentHistory,
    };
  }

  private async subQrIssueHistory(packageIds: string[]) {
    if (packageIds.length === 0) return [];
    const allocations = await this.disbursementPackageRepository
      .createQueryBuilder('alloc')
      .leftJoinAndSelect('alloc.disbursementItem', 'item')
      .leftJoinAndSelect('item.disbursement', 'disbursement')
      .where('alloc.package_id IN (:...packageIds)', { packageIds })
      .orderBy('alloc.created_at', 'ASC')
      .getMany();
    return allocations.map((a) => ({
      allocationId: a.id,
      packageId: a.packageId,
      disbursedQuantity: a.disbursedQuantity,
      fifoOrder: a.fifoOrder,
      disbursementId: a.disbursementItem?.disbursement?.id ?? null,
      disbursementNo: a.disbursementItem?.disbursement?.disbursementNo ?? null,
      department: a.disbursementItem?.disbursement?.departmentId ?? null,
      productionOrder:
        a.disbursementItem?.disbursement?.productionOrder ?? null,
      reversedAt: a.reversedAt,
      reversedBy: a.reversedBy,
    }));
  }

  // ------------------------------------------------------- document traces

  async traceReceiving(id: string) {
    const receiving = await this.receivingRepository.findOne({ where: { id } });
    if (!receiving) {
      throw new NotFoundException(`Material receiving ${id} not found`);
    }
    return this.traceMainQr(id);
  }

  async traceDisbursement(id: string) {
    const disbursement = await this.disbursementRepository
      .createQueryBuilder('disbursement')
      .leftJoinAndSelect('disbursement.items', 'items')
      .leftJoinAndSelect('items.material', 'material')
      .where('disbursement.id = :id', { id })
      .getOne();
    if (!disbursement) {
      throw new NotFoundException(`Materials disbursement ${id} not found`);
    }

    const itemIds = disbursement.items.map((i) => i.id);
    const allocations = itemIds.length
      ? await this.disbursementPackageRepository
          .createQueryBuilder('alloc')
          .leftJoinAndSelect('alloc.package', 'pkg')
          .leftJoinAndSelect('pkg.materialReceiving', 'receiving')
          .where('alloc.disbursement_item_id IN (:...itemIds)', { itemIds })
          .orderBy('alloc.disbursement_item_id', 'ASC')
          .addOrderBy('alloc.fifo_order', 'ASC')
          .getMany()
      : [];

    const movements = await this.stockTransactionRepository.find({
      where: { referenceType: 'MATERIALS_DISBURSEMENT', referenceId: id },
      order: { transactionDate: 'ASC', id: 'ASC' },
    });

    return {
      disbursement: {
        id: disbursement.id,
        traceId: disbursement.traceId,
        disbursementNo: disbursement.disbursementNo,
        disbursementType: disbursement.disbursementType,
        disbursementDate: disbursement.disbursementDate,
        status: disbursement.status,
        departmentId: disbursement.departmentId,
        productionOrder: disbursement.productionOrder,
        referenceNo: disbursement.referenceNo,
        requestedBy: disbursement.requestedBy,
        approvedBy: disbursement.approvedBy,
        confirmedBy: disbursement.confirmedBy,
        confirmedAt: disbursement.confirmedAt,
        cancelledBy: disbursement.cancelledBy,
        cancelledAt: disbursement.cancelledAt,
        cancelReason: disbursement.cancelReason,
      },
      items: disbursement.items.map((item) => ({
        id: item.id,
        materialId: item.materialId,
        material: item.material
          ? {
              id: item.material.id,
              code: item.material.code,
              name: item.material.name,
            }
          : null,
        requestedQuantity: item.requestedQuantity,
        disbursedQuantity: item.disbursedQuantity,
        // §7/§13: FIFO allocation traceability, including reversals — the
        // original allocation row is never deleted, only flagged reversed.
        fifoAllocations: allocations
          .filter((a) => a.disbursementItemId === item.id)
          .map((a) => ({
            id: a.id,
            packageId: a.packageId,
            lotDetailNo: a.package?.lotDetailNo ?? null,
            internalLotNo: a.package?.materialReceiving?.internalLotNo ?? null,
            receiveDate: a.package?.materialReceiving?.receiveDate ?? null,
            fifoOrder: a.fifoOrder,
            disbursedQuantity: a.disbursedQuantity,
            reversedAt: a.reversedAt,
            reversedBy: a.reversedBy,
          })),
      })),
      movements: movements.map((m) => this.toMovementSummary(m)),
    };
  }

  // ---------------------------------------------------------------- helpers

  private buildBaseQuery(
    query: QueryMaterialTraceabilityDto,
  ): SelectQueryBuilder<StockTransaction> {
    const qb = this.stockTransactionRepository
      .createQueryBuilder('st')
      .leftJoin(Material, 'material', 'material.id = st.material_id')
      .leftJoin(MaterialReceiving, 'mainQr', 'mainQr.id = st.main_qr_id')
      .leftJoin(MaterialReceivingPackage, 'subQr', 'subQr.id = st.sub_qr_id')
      .leftJoin(
        MaterialReceiving,
        'receivingDoc',
        "st.reference_type = 'MATERIAL_RECEIVING' AND receivingDoc.id = st.reference_id",
      )
      .leftJoin(
        MaterialsDisbursement,
        'disbursementDoc',
        "st.reference_type = 'MATERIALS_DISBURSEMENT' AND disbursementDoc.id = st.reference_id",
      )
      .leftJoin(Supplier, 'supplier', 'supplier.id = mainQr.supplier_id')
      .leftJoin(Unit, 'unit', 'unit.id = st.unit_id')
      .leftJoin(Department, 'department', 'department.id = st.department_id')
      .leftJoin(User, 'operatorUser', 'operatorUser.id = st.created_by');
    this.applyFilters(qb, query);
    return qb;
  }

  private applySelect(qb: SelectQueryBuilder<StockTransaction>): void {
    const [[firstExpr, firstAlias], ...rest] = MOVEMENT_COLUMNS;
    qb.select(firstExpr, firstAlias);
    for (const [expr, alias] of rest) {
      qb.addSelect(expr, alias);
    }
  }

  /**
   * Every filter in §2 of the spec, applied identically whether the caller
   * wants the summary, the paginated table, or (via the frontend re-issuing
   * this same query string) an export — see the DTO's own doc comment.
   * Every value is bound as a query parameter; none is concatenated into
   * the SQL string.
   */
  private applyFilters(
    qb: SelectQueryBuilder<StockTransaction>,
    query: QueryMaterialTraceabilityDto,
  ): void {
    if (query.dateFrom) {
      qb.andWhere('st.transaction_date >= :dateFrom', {
        dateFrom: query.dateFrom,
      });
    }
    if (query.dateTo) {
      qb.andWhere(
        "st.transaction_date < ((:dateTo)::date + INTERVAL '1 day')",
        {
          dateTo: query.dateTo,
        },
      );
    }
    if (query.materialId) {
      qb.andWhere('st.material_id = :materialId', {
        materialId: query.materialId,
      });
    }
    if (query.materialCode) {
      qb.andWhere('material.code ILIKE :materialCode', {
        materialCode: `%${query.materialCode}%`,
      });
    }
    if (query.materialName) {
      qb.andWhere('material.name ILIKE :materialName', {
        materialName: `%${query.materialName}%`,
      });
    }
    if (query.materialType) {
      qb.andWhere('material.type = :materialType', {
        materialType: query.materialType,
      });
    }
    if (query.shape) {
      qb.andWhere('material.material_type = :shape', { shape: query.shape });
    }
    if (query.internalLotNo) {
      qb.andWhere('mainQr.internal_lot_no = :internalLotNo', {
        internalLotNo: query.internalLotNo,
      });
    }
    if (query.supplierLotNo) {
      qb.andWhere('mainQr.supplier_lot_no = :supplierLotNo', {
        supplierLotNo: query.supplierLotNo,
      });
    }
    if (query.mainQr) {
      qb.andWhere('mainQr.internal_lot_no ILIKE :mainQr', {
        mainQr: `%${query.mainQr}%`,
      });
    }
    if (query.subQr) {
      qb.andWhere('subQr.lot_detail_no ILIKE :subQr', {
        subQr: `%${query.subQr}%`,
      });
    }
    if (query.transactionType) {
      qb.andWhere('st.transaction_type = :transactionType', {
        transactionType: query.transactionType,
      });
    }
    if (query.receivingNo) {
      qb.andWhere('receivingDoc.internal_lot_no ILIKE :receivingNo', {
        receivingNo: `%${query.receivingNo}%`,
      });
    }
    if (query.disbursementNo) {
      qb.andWhere('disbursementDoc.disbursement_no ILIKE :disbursementNo', {
        disbursementNo: `%${query.disbursementNo}%`,
      });
    }
    if (query.supplierId) {
      qb.andWhere('mainQr.supplier_id = :supplierId', {
        supplierId: query.supplierId,
      });
    }
    if (query.departmentId) {
      qb.andWhere('st.department_id = :departmentId', {
        departmentId: query.departmentId,
      });
    }
    if (query.productionOrder) {
      qb.andWhere('st.production_order ILIKE :productionOrder', {
        productionOrder: `%${query.productionOrder}%`,
      });
    }
    if (query.referenceNo) {
      qb.andWhere('st.reference_no ILIKE :referenceNo', {
        referenceNo: `%${query.referenceNo}%`,
      });
    }
    if (query.operator) {
      qb.andWhere('operatorUser.username ILIKE :operator', {
        operator: `%${query.operator}%`,
      });
    }
    if (query.status) {
      qb.andWhere(
        'COALESCE(receivingDoc.status, disbursementDoc.status) = :status',
        {
          status: query.status,
        },
      );
    }
  }

  private toMovementResponse(row: MovementRow) {
    return {
      id: row.id,
      transactionNo: row.transactionNo,
      traceId: row.traceId,
      transactionType: row.transactionType,
      transactionDate: row.transactionDate,
      referenceType: row.referenceType,
      referenceNo: row.referenceNo,
      material: {
        id: row.materialId,
        code: row.materialCode,
        name: row.materialName,
        type: row.materialType,
        shape: row.shape,
      },
      internalLotNo: row.mainQrCode ?? row.referenceLotNo,
      supplierLotNo: row.supplierLotNo,
      mainQr: row.mainQrId ? { id: row.mainQrId, code: row.mainQrCode } : null,
      subQr: row.subQrId
        ? {
            id: row.subQrId,
            code: row.subQrCode,
            boxNo: row.boxNo,
            status: row.subQrStatus,
          }
        : null,
      receiving: row.receivingId
        ? {
            id: row.receivingId,
            no: row.receivingNo,
            status: row.receivingStatus,
          }
        : null,
      disbursement: row.disbursementId
        ? {
            id: row.disbursementId,
            no: row.disbursementNo,
            status: row.disbursementStatus,
          }
        : null,
      quantityBefore: row.quantityBefore,
      movementQty: this.fromScaled(
        this.toScaled(row.quantityIn) - this.toScaled(row.quantityOut),
      ),
      quantityIn: row.quantityIn,
      quantityOut: row.quantityOut,
      quantityAfter: row.quantityAfter,
      unit: row.unitSymbol,
      sourceLocationId: row.sourceLocationId,
      destinationLocationId: row.destinationLocationId,
      supplier: row.supplierId
        ? {
            id: row.supplierId,
            nameTh: row.supplierNameTh,
            nameEn: row.supplierNameEn,
          }
        : null,
      department: row.departmentId
        ? { id: row.departmentId, nameTh: row.departmentNameTh }
        : null,
      productionOrder: row.productionOrder,
      performedBy: row.performedById
        ? { id: row.performedById, username: row.performedByUsername }
        : null,
      createdAt: row.createdAt,
      remark: row.remark,
      reason: row.reason,
    };
  }

  private toMovementSummary(m: StockTransaction) {
    return {
      id: m.id,
      transactionNo: m.transactionNo,
      traceId: m.traceId,
      transactionType: m.transactionType,
      transactionDate: m.transactionDate,
      referenceType: m.referenceType,
      referenceId: m.referenceId,
      referenceNo: m.referenceNo,
      mainQrId: m.mainQrId,
      subQrId: m.subQrId,
      quantityBefore: m.quantityBefore,
      movementQty: this.fromScaled(
        this.toScaled(m.quantityIn) - this.toScaled(m.quantityOut),
      ),
      quantityAfter: m.quantityAfter,
      performedBy: m.createdBy,
      remark: m.remark,
      reason: m.reason,
    };
  }

  private toScaled(value: string): bigint {
    const [integerPart, fractionPart = ''] = value.split('.');
    const negative = integerPart.startsWith('-');
    const digits = negative ? integerPart.slice(1) : integerPart;
    const fraction = `${fractionPart}0000`.slice(0, DECIMAL_SCALE);
    const scaled = BigInt(`${digits}${fraction}`);
    return negative ? -scaled : scaled;
  }

  private fromScaled(scaled: bigint): string {
    const isNegative = scaled < 0n;
    const abs = isNegative ? -scaled : scaled;
    const str = abs.toString().padStart(DECIMAL_SCALE + 1, '0');
    const integerPart = str.slice(0, str.length - DECIMAL_SCALE) || '0';
    const fractionPart = str.slice(str.length - DECIMAL_SCALE);
    const result = `${integerPart}.${fractionPart}`;
    return isNegative ? `-${result}` : result;
  }
}
