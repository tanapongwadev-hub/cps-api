import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { parseTransferBoxCode } from '../domain/packing';
import { loadWipBoxes } from '../production-process/wip-boxes';

export interface OriginShare {
  lotNo: string;
  productionDate: string;
  shift: string;
  qty: number;
}

export interface TraceNode {
  lotId: string;
  lotNo: string;
  lotType: string;
  stepIndex: number;
  processCode: string;
  productionDate: string;
  shift: string;
  producedQty: number;
  remainingQty: number;
  /** Pieces that flowed along the edge to the node above (null at the root). */
  edgeQty: number | null;
  /** Origin composition of the whole lot (materialized, exact). */
  origins: Array<OriginShare & { qtyRemaining: number }>;
  /** Backward: lots this one was made from. Forward: lots made from it. */
  links: TraceNode[];
  /** Forward trace of an FG/STORE lot: its boxes. */
  packages?: Array<{
    qrCode: string;
    boxNo: number;
    qty: number;
    status: string;
    origins: OriginShare[];
  }>;
}

interface LotRow {
  id: string;
  lot_no: string;
  lot_type: string;
  step_index: number;
  process_code: string;
  production_date: string;
  shift_key: string;
  produced_qty: number;
  remaining_qty: number;
}

interface LineGraph {
  lots: Map<string, LotRow>;
  /** target lot id → [{source lot id, qty}] */
  sourcesOf: Map<string, Array<{ id: string; qty: number }>>;
  /** source lot id → [{target lot id, qty}] */
  targetsOf: Map<string, Array<{ id: string; qty: number }>>;
  origins: Map<
    string,
    Array<{ originId: string; qty: number; qtyRemaining: number }>
  >;
}

/**
 * Lot traceability reads. All lineage of a product stays inside one
 * production order line, so a trace loads that line's lots, lineage edges
 * and origin compositions once and walks them in memory. Quantities come
 * from the materialized composition tables — exact, never estimated.
 */
@Injectable()
export class TraceabilityService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /** QR code of a box, or a lot number. */
  async scan(code: string) {
    const value = code.trim();
    if (/^QR-/i.test(value)) return this.traceByQrCode(value);
    if (/^TQ-/i.test(value)) return this.traceByTransferTag(value);
    const rows = await this.dataSource.query<Array<{ id: string }>>(
      `SELECT id FROM inventory.production_lots WHERE lot_no = $1`,
      [value.toUpperCase()],
    );
    if (!rows.length) {
      throw new NotFoundException(`ไม่พบ QR หรือเลข Lot "${value}"`);
    }
    return {
      kind: 'LOT' as const,
      ...(await this.traceLot(String(rows[0].id), 'backward')),
    };
  }

  /**
   * Transfer tag (QR made when work is sent to the next step): where this
   * batch is now — waiting at the step, produced into which lots, scrapped or
   * closed — plus where it came from.
   */
  async traceByTransferTag(rawCode: string) {
    const boxRef = parseTransferBoxCode(rawCode);
    const code = boxRef ? boxRef.batchQr : rawCode;
    const rows = await this.dataSource.query<
      Array<{
        id: string;
        qr_code: string;
        line_id: string;
        step_index: number;
        step_code: string;
        step_name: string;
        source_lot_id: string;
        qty_in: number;
        qty_used: number;
        qty_rejected: number;
        qty_closed: number;
        qty_remaining: number;
        received_at: Date;
      }>
    >(
      `SELECT w.id, w.qr_code, w.production_order_line_id AS line_id, w.step_index,
              ps.code AS step_code, ps.name_th AS step_name, w.source_lot_id,
              w.qty_in, w.qty_used, w.qty_rejected, w.qty_closed, w.qty_remaining,
              w.received_at
       FROM inventory.process_wip w
       JOIN master.process_steps ps ON ps.id = w.process_step_id
       WHERE w.qr_code = $1`,
      [code.trim().toUpperCase()],
    );
    const wip = rows[0];
    if (!wip) throw new NotFoundException(`ไม่พบ QR ส่งต่อ "${code}"`);

    const lineId = String(wip.line_id);
    const graph = await this.loadLine(lineId);
    const context = await this.lineContext(lineId);
    const source = graph.lots.get(String(wip.source_lot_id))!;
    const origins = await this.dataSource.query<
      Array<{
        lot_no: string;
        production_date: string;
        shift_key: string;
        qty: number;
        qty_remaining: number;
      }>
    >(
      `SELECT l.lot_no, l.production_date::text AS production_date, l.shift_key,
              o.qty, o.qty_remaining
       FROM inventory.process_wip_origins o
       JOIN inventory.production_lots l ON l.id = o.origin_lot_id
       WHERE o.wip_id = $1 ORDER BY l.production_date, l.id`,
      [wip.id],
    );
    const produced = await this.dataSource.query<
      Array<{
        lot_no: string;
        lot_type: string;
        step_code: string;
        remaining_qty: number;
        qty: number;
      }>
    >(
      `SELECT tl.lot_no, tl.lot_type, ps.code AS step_code, tl.remaining_qty,
              SUM(t.qty)::int AS qty
       FROM inventory.production_transactions t
       LEFT JOIN inventory.production_transactions o ON o.id = t.reverses_transaction_id
       JOIN inventory.production_lots tl ON tl.id = t.target_lot_id
       JOIN master.process_steps ps ON ps.id = tl.process_step_id
       WHERE t.source_wip_id = $1
         AND (t.transaction_type IN ('PROCESS_OUTPUT','FG_RECEIVE')
              OR (t.transaction_type = 'REVERSAL'
                  AND o.transaction_type IN ('PROCESS_OUTPUT','FG_RECEIVE')))
       GROUP BY tl.id, ps.code HAVING SUM(t.qty) <> 0
       ORDER BY tl.id`,
      [wip.id],
    );
    const boxes =
      (await loadWipBoxes(this.dataSource.manager, [String(wip.id)])).get(
        String(wip.id),
      ) ?? [];
    const box = boxRef
      ? boxes.find((b) => b.boxNo === boxRef.boxNo)
      : undefined;
    if (boxRef && !box) {
      throw new NotFoundException(`ไม่พบ QR ส่งต่อ "${rawCode}"`);
    }
    const originInfo = new Map(origins.map((o) => [o.lot_no, o]));
    return {
      kind: 'TRANSFER' as const,
      box: box
        ? {
            qrCode: box.qrCode,
            revision: box.revision,
            /** Set when the scanned label is an old one of a split box. */
            supersededBy:
              boxRef && boxRef.revision !== box.revision && box.left > 0
                ? box.qrCode
                : null,
            boxNo: box.boxNo,
            boxCount: box.boxCount,
            qty: box.qty,
            doneQty: box.doneQty,
            left: box.left,
            status: box.status,
            origins: box.origins.map((o) => ({
              lotNo: o.lotNo,
              productionDate: originInfo.get(o.lotNo)?.production_date ?? '',
              shift: originInfo.get(o.lotNo)?.shift_key ?? '',
              qty: o.qty,
            })),
          }
        : null,
      boxes: boxes.map((b) => ({
        qrCode: b.qrCode,
        boxNo: b.boxNo,
        qty: b.qty,
        doneQty: b.doneQty,
        left: b.left,
        status: b.status,
      })),
      qrCode: wip.qr_code,
      ...context,
      fromStep: { stepIndex: source.step_index, code: source.process_code },
      toStep: {
        stepIndex: Number(wip.step_index),
        code: wip.step_code,
        name: wip.step_name,
      },
      sourceLotNo: source.lot_no,
      sentAt: wip.received_at,
      qty: Number(wip.qty_in),
      waitingQty: Number(wip.qty_remaining),
      producedQty: Number(wip.qty_used),
      rejectedQty: Number(wip.qty_rejected),
      closedQty: Number(wip.qty_closed),
      producedInto: produced.map((p) => ({
        lotNo: p.lot_no,
        lotType: p.lot_type,
        stepCode: p.step_code,
        qty: Number(p.qty),
        lotRemainingQty: Number(p.remaining_qty),
      })),
      origins: origins.map((o) => ({
        lotNo: o.lot_no,
        productionDate: o.production_date,
        shift: o.shift_key,
        qty: Number(o.qty),
      })),
      lineage: this.node(graph, source.id, 'backward', null, new Set()),
    };
  }

  /**
   * Resolve a box QR or lot number to the production order line and the FG
   * boxes it covers: a box QR covers itself, an FG lot covers its boxes, any
   * other lot covers every box of its order line (`scope = 'ORDER_LINE'`,
   * because boxes are not tracked per intermediate lot).
   */
  private async resolveCommercialScope(code: string) {
    const q = code.trim();
    type Row = { line_id: string; order_id: string; package_ids: string[] | null; scope: string };
    const byBox = await this.dataSource.query<Row[]>(
      `SELECT p.production_order_line_id AS line_id, p.production_order_id AS order_id,
              ARRAY[p.id::text] AS package_ids, 'BOX' AS scope
       FROM inventory.production_packages p WHERE p.qr_code = $1`,
      [q.toUpperCase()],
    );
    if (byBox[0]) return byBox[0];
    const lots = await this.dataSource.query<Array<{ id: string; line_id: string; order_id: string }>>(
      `SELECT l.id, l.production_order_line_id AS line_id, ol.production_order_id AS order_id
       FROM inventory.production_lots l
       JOIN inventory.production_order_lines ol ON ol.id = l.production_order_line_id
       WHERE l.lot_no = $1`,
      [q],
    );
    const lot = lots[0];
    if (!lot) throw new NotFoundException(`ไม่พบ QR หรือ Lot "${code}"`);
    const fgBoxes = await this.dataSource.query<Array<{ id: string }>>(
      `SELECT id FROM inventory.production_packages WHERE fg_lot_id = $1 AND status <> 'VOID'`,
      [lot.id],
    );
    if (fgBoxes.length) {
      return { line_id: lot.line_id, order_id: lot.order_id, package_ids: fgBoxes.map((b) => String(b.id)), scope: 'FG_LOT' };
    }
    const lineBoxes = await this.dataSource.query<Array<{ id: string }>>(
      `SELECT id FROM inventory.production_packages WHERE production_order_line_id = $1 AND status <> 'VOID'`,
      [lot.line_id],
    );
    return { line_id: lot.line_id, order_id: lot.order_id, package_ids: lineBoxes.map((b) => String(b.id)), scope: 'ORDER_LINE' };
  }

  /**
   * Where a product lot went (sales shipments per box) and which material
   * lots were issued to its production plan. Material lots are attributed per
   * plan (the job order issues to the plan, not per production lot).
   */
  async commercialTrace(code: string, access: { sales: boolean; materials: boolean }) {
    const scope = await this.resolveCommercialScope(code);
    const ids = scope.package_ids ?? [];

    const production = (
      await this.dataSource.query<Array<Record<string, string | null>>>(
        `SELECT o.code AS "orderCode", pl.code AS "planCode", pl.id AS "planId",
                COALESCE(prod.code, tm.code) AS "productCode", COALESCE(prod.name, tm.name) AS "productName",
                to_char(o.created_at, 'YYYY-MM-DD') AS "orderedDate"
         FROM inventory.production_orders o
         JOIN inventory.production_plans pl ON pl.id = o.production_plan_id
         JOIN inventory.production_order_lines ol ON ol.production_order_id = o.id AND ol.id = $2
         LEFT JOIN master.products prod ON prod.id = ol.product_id
         LEFT JOIN master.materials tm ON tm.id = ol.material_id
         WHERE o.id = $1`,
        [scope.order_id, scope.line_id],
      )
    )[0];

    const boxes = ids.length
      ? await this.dataSource.query(
          `SELECT p.qr_code AS "qrCode", p.box_no AS "boxNo", p.initial_qty AS qty, p.status,
                  lot.lot_no AS "fgLotNo", to_char(lot.production_date, 'YYYY-MM-DD') AS "productionDate", lot.shift_key AS shift
           FROM inventory.production_packages p
           LEFT JOIN inventory.production_lots lot ON lot.id = p.fg_lot_id
           WHERE p.id = ANY($1::bigint[]) ORDER BY p.box_no`,
          [ids],
        )
      : [];

    const sales = access.sales && ids.length
      ? await this.dataSource.query(
          `SELECT s.issue_no AS "issueNo", to_char(s.issue_date, 'YYYY-MM-DD') AS "issueDate", s.qty,
                  so.code AS "salesOrderCode", c.name_th AS "customerName", p.qr_code AS "qrCode", p.box_no AS "boxNo"
           FROM inventory.sales_shipments s
           JOIN inventory.production_packages p ON p.id = s.package_id
           LEFT JOIN inventory.sales_orders so ON so.id = s.sales_order_id
           LEFT JOIN master.customers c ON c.id = s.customer_id
           WHERE s.package_id = ANY($1::bigint[])
           ORDER BY s.issue_date, s.issue_no, p.box_no`,
          [ids],
        )
      : [];

    const materialLots = access.materials && production?.planId
      ? await this.dataSource.query(
          `SELECT m.code AS "materialCode", m.name AS "materialName", r.internal_lot_no AS "internalLotNo",
                  r.supplier_lot_no AS "supplierLotNo", to_char(r.receive_date, 'YYYY-MM-DD') AS "receiveDate",
                  sup.name_th AS "supplierName", SUM(res.issued_quantity)::float8 AS "issuedQty",
                  u.name_th AS "unit", jo.code AS "jobOrderCode",
                  to_char(MAX(res.picked_at), 'YYYY-MM-DD') AS "pickedDate"
           FROM inventory.production_plan_reservations res
           JOIN inventory.production_plan_lines line ON line.id = res.production_plan_line_id
           JOIN inventory.material_receiving_packages pkg ON pkg.id = res.material_receiving_package_id
           JOIN inventory.material_receivings r ON r.id = pkg.material_receiving_id
           JOIN master.materials m ON m.id = r.material_id
           LEFT JOIN master.suppliers sup ON sup.id = r.supplier_id
           LEFT JOIN master.units u ON u.id = r.unit_id
           LEFT JOIN inventory.material_job_orders jo ON jo.production_plan_id = line.production_plan_id
           WHERE line.production_plan_id = $1 AND res.issued_quantity > 0
           GROUP BY m.code, m.name, r.internal_lot_no, r.supplier_lot_no, r.receive_date, sup.name_th, u.name_th, jo.code
           ORDER BY m.code, r.internal_lot_no`,
          [production.planId],
        )
      : [];

    return {
      query: code.trim(),
      scope: scope.scope as 'BOX' | 'FG_LOT' | 'ORDER_LINE',
      production,
      boxes,
      sales,
      materialLots,
      access,
    };
  }

  /**
   * Finished-product lots (FG lots with packed boxes) for the product-lot
   * report: when produced, how much was packed and sold, first/last sale.
   * `soldQty` is null when the caller cannot see sales.
   */
  async listProductLots(
    query: {
      search?: string;
      productId?: string;
      dateFrom?: string;
      dateTo?: string;
      soldStatus?: 'UNSOLD' | 'PARTIAL' | 'SOLD';
      page: number;
      limit: number;
    },
    canSeeSales: boolean,
  ) {
    const params: unknown[] = [];
    const where: string[] = [];
    const add = (value: unknown) => {
      params.push(value);
      return `$${params.length}`;
    };
    if (query.search?.trim()) {
      const p = add(`%${query.search.trim()}%`);
      where.push(`(b.lot_no ILIKE ${p} OR b.product_code ILIKE ${p} OR b.product_name ILIKE ${p} OR b.order_code ILIKE ${p})`);
    }
    if (query.productId && /^\d+$/.test(query.productId)) where.push(`b.product_id = ${add(query.productId)}`);
    if (query.dateFrom) where.push(`b.production_date >= ${add(query.dateFrom)}`);
    if (query.dateTo) where.push(`b.production_date <= ${add(query.dateTo)}`);
    if (query.soldStatus === 'UNSOLD') where.push('COALESCE(b.sold_qty, 0) = 0');
    if (query.soldStatus === 'PARTIAL') where.push('b.sold_qty > 0 AND b.sold_qty < b.packed_qty');
    if (query.soldStatus === 'SOLD') where.push('b.sold_qty >= b.packed_qty AND b.packed_qty > 0');

    const base = `
      WITH packed AS (
        SELECT lot.id AS lot_id, lot.lot_no, lot.production_date, lot.shift_key, lot.production_order_line_id,
               SUM(p.initial_qty)::float8 AS packed_qty, COUNT(*)::int AS box_count
        FROM inventory.production_lots lot
        JOIN inventory.production_packages p ON p.fg_lot_id = lot.id AND p.status <> 'VOID'
        GROUP BY lot.id
      ), sold AS (
        SELECT p.fg_lot_id AS lot_id, SUM(s.qty)::float8 AS sold_qty,
               MIN(s.issue_date) AS first_sale, MAX(s.issue_date) AS last_sale
        FROM inventory.sales_shipments s
        JOIN inventory.production_packages p ON p.id = s.package_id
        GROUP BY p.fg_lot_id
      ), b AS (
        SELECT pk.lot_id, pk.lot_no, pk.production_date, pk.shift_key, pk.packed_qty, pk.box_count,
               o.code AS order_code, ol.product_id, prod.code AS product_code, prod.name AS product_name,
               ${canSeeSales ? 'sd.sold_qty, sd.first_sale, sd.last_sale' : 'NULL::float8 AS sold_qty, NULL::date AS first_sale, NULL::date AS last_sale'}
        FROM packed pk
        JOIN inventory.production_order_lines ol ON ol.id = pk.production_order_line_id
        JOIN inventory.production_orders o ON o.id = ol.production_order_id
        LEFT JOIN master.products prod ON prod.id = ol.product_id
        LEFT JOIN sold sd ON sd.lot_id = pk.lot_id
        WHERE ol.product_id IS NOT NULL
      )`;
    const filter = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [summary] = await this.dataSource.query<Array<Record<string, number | null>>>(
      `${base} SELECT COUNT(*)::int AS lots, COALESCE(SUM(b.box_count), 0)::int AS boxes,
                COALESCE(SUM(b.packed_qty), 0)::float8 AS packed, ${canSeeSales ? 'COALESCE(SUM(b.sold_qty), 0)::float8' : 'NULL::float8'} AS sold
         FROM b ${filter}`,
      params,
    );
    const offset = (query.page - 1) * query.limit;
    const rows = await this.dataSource.query(
      `${base} SELECT b.lot_id AS "lotId", b.lot_no AS "lotNo", to_char(b.production_date, 'YYYY-MM-DD') AS "productionDate",
              b.shift_key AS shift, b.order_code AS "orderCode", b.product_code AS "productCode", b.product_name AS "productName",
              b.packed_qty AS "packedQty", b.box_count AS "boxCount", b.sold_qty AS "soldQty",
              to_char(b.first_sale, 'YYYY-MM-DD') AS "firstSaleDate", to_char(b.last_sale, 'YYYY-MM-DD') AS "lastSaleDate"
       FROM b ${filter}
       ORDER BY b.production_date DESC, b.lot_id DESC
       LIMIT ${add(query.limit)} OFFSET ${add(offset)}`,
      params,
    );
    const total = Number(summary?.lots ?? 0);
    return {
      items: rows,
      summary: {
        lots: total,
        boxes: Number(summary?.boxes ?? 0),
        packedQty: Number(summary?.packed ?? 0),
        soldQty: summary?.sold === null || summary?.sold === undefined ? null : Number(summary.sold),
      },
      meta: { page: query.page, limit: query.limit, totalItems: total, totalPages: Math.max(1, Math.ceil(total / query.limit)) },
      access: { sales: canSeeSales },
    };
  }

  /** Box → FG lot → … → first-step lots → production order. */
  async traceByQrCode(qrCode: string) {
    const rows = await this.dataSource.query<
      Array<{
        id: string;
        qr_code: string;
        box_no: number;
        unit_type: string;
        initial_qty: number;
        current_qty: number;
        status: string;
        created_at: Date;
        fg_lot_id: string;
        line_id: string;
      }>
    >(
      `SELECT id, qr_code, box_no, unit_type, initial_qty, current_qty, status,
              created_at, fg_lot_id, production_order_line_id AS line_id
       FROM inventory.production_packages WHERE qr_code = $1`,
      [qrCode.trim().toUpperCase()],
    );
    const pkg = rows[0];
    if (!pkg) throw new NotFoundException(`ไม่พบกล่อง QR "${qrCode}"`);

    const graph = await this.loadLine(String(pkg.line_id));
    const context = await this.lineContext(String(pkg.line_id));
    const origins = await this.packageOrigins([String(pkg.id)]);
    const fgLot = graph.lots.get(String(pkg.fg_lot_id))!;
    return {
      kind: 'PACKAGE' as const,
      qrCode: pkg.qr_code,
      boxNo: Number(pkg.box_no),
      unitType: pkg.unit_type,
      qty: Number(pkg.initial_qty),
      currentQty: Number(pkg.current_qty),
      status: pkg.status,
      packedAt: pkg.created_at,
      receivedDate: fgLot.production_date,
      ...context,
      origins: origins.get(String(pkg.id)) ?? [],
      lineage: this.node(graph, fgLot.id, 'backward', null, new Set()),
    };
  }

  /** Backward (where it came from) or forward (where it went) from a lot. */
  async traceLot(lotId: string, direction: 'backward' | 'forward') {
    const rows = await this.dataSource.query<Array<{ line_id: string }>>(
      `SELECT production_order_line_id AS line_id FROM inventory.production_lots WHERE id = $1`,
      [lotId],
    );
    if (!rows.length) throw new NotFoundException(`ไม่พบ Lot id ${lotId}`);
    const lineId = String(rows[0].line_id);
    const graph = await this.loadLine(lineId);
    const packages =
      direction === 'forward' ? await this.linePackages(lineId) : undefined;
    return {
      direction,
      ...(await this.lineContext(lineId)),
      lineage: this.node(graph, lotId, direction, null, new Set(), packages),
    };
  }

  /** Production order → every first-step lot → … → boxes (forward). */
  async traceOrder(orderId: string) {
    const lines = await this.dataSource.query<
      Array<{ id: string; line_no: number }>
    >(
      `SELECT id, line_no FROM inventory.production_order_lines
       WHERE production_order_id = $1 ORDER BY line_no`,
      [orderId],
    );
    if (!lines.length) {
      throw new NotFoundException(`ไม่พบใบสั่งผลิต id ${orderId}`);
    }
    const result = [];
    for (const line of lines) {
      const lineId = String(line.id);
      const graph = await this.loadLine(lineId);
      const packages = await this.linePackages(lineId);
      const context = await this.lineContext(lineId);
      const origins = [...graph.lots.values()].filter(
        (l) => l.lot_type === 'ORIGIN',
      );
      result.push({
        lineNo: Number(line.line_no),
        product: context.product,
        plannedQty: context.plannedQty,
        originLots: origins.map((l) =>
          this.node(graph, l.id, 'forward', null, new Set(), packages),
        ),
      });
    }
    const head = await this.lineContext(String(lines[0].id));
    return {
      productionOrder: head.productionOrder,
      productionPlan: head.productionPlan,
      lines: result,
    };
  }

  // ------------------------------------------------------------------ helpers

  private node(
    graph: LineGraph,
    lotId: string,
    direction: 'backward' | 'forward',
    edgeQty: number | null,
    path: Set<string>,
    packages?: Map<string, NonNullable<TraceNode['packages']>>,
  ): TraceNode {
    const lot = graph.lots.get(lotId)!;
    const nextPath = new Set(path).add(lotId);
    const edges =
      (direction === 'backward'
        ? graph.sourcesOf.get(lotId)
        : graph.targetsOf.get(lotId)) ?? [];
    const node: TraceNode = {
      lotId: lot.id,
      lotNo: lot.lot_no,
      lotType: lot.lot_type,
      stepIndex: Number(lot.step_index),
      processCode: lot.process_code,
      productionDate: lot.production_date,
      shift: lot.shift_key,
      producedQty: Number(lot.produced_qty),
      remainingQty: Number(lot.remaining_qty),
      edgeQty,
      origins: (graph.origins.get(lotId) ?? []).map((o) => {
        const origin = graph.lots.get(o.originId)!;
        return {
          lotNo: origin.lot_no,
          productionDate: origin.production_date,
          shift: origin.shift_key,
          qty: o.qty,
          qtyRemaining: o.qtyRemaining,
        };
      }),
      links: edges
        .filter((e) => !nextPath.has(e.id)) // lineage is acyclic; guard anyway
        .map((e) =>
          this.node(graph, e.id, direction, e.qty, nextPath, packages),
        ),
    };
    if (packages && (lot.lot_type === 'FG' || lot.lot_type === 'STORE')) {
      node.packages = packages.get(lotId) ?? [];
    }
    return node;
  }

  private async loadLine(lineId: string): Promise<LineGraph> {
    const lots = await this.dataSource.query<LotRow[]>(
      `SELECT id, lot_no, lot_type, step_index, process_code,
              production_date::text AS production_date, shift_key,
              produced_qty, remaining_qty
       FROM inventory.production_lots
       WHERE production_order_line_id = $1
       ORDER BY step_index, production_date, id`,
      [lineId],
    );
    const edges = await this.dataSource.query<
      Array<{ target_lot_id: string; source_lot_id: string; qty: number }>
    >(
      `SELECT s.target_lot_id, s.source_lot_id, SUM(s.qty)::int AS qty
       FROM inventory.production_lot_sources s
       JOIN inventory.production_lots t ON t.id = s.target_lot_id
       WHERE t.production_order_line_id = $1
       GROUP BY s.target_lot_id, s.source_lot_id
       HAVING SUM(s.qty) > 0
       ORDER BY s.source_lot_id`,
      [lineId],
    );
    const origins = await this.dataSource.query<
      Array<{
        lot_id: string;
        origin_lot_id: string;
        qty: number;
        qty_remaining: number;
      }>
    >(
      `SELECT o.lot_id, o.origin_lot_id, o.qty, o.qty_remaining
       FROM inventory.production_lot_origins o
       JOIN inventory.production_lots l ON l.id = o.lot_id
       JOIN inventory.production_lots ol ON ol.id = o.origin_lot_id
       WHERE l.production_order_line_id = $1 AND o.qty > 0
       ORDER BY ol.production_date, ol.id`,
      [lineId],
    );

    const graph: LineGraph = {
      lots: new Map(
        lots.map((l) => [String(l.id), { ...l, id: String(l.id) }]),
      ),
      sourcesOf: new Map(),
      targetsOf: new Map(),
      origins: new Map(),
    };
    for (const e of edges) {
      const target = String(e.target_lot_id);
      const source = String(e.source_lot_id);
      const qty = Number(e.qty);
      graph.sourcesOf.set(target, [
        ...(graph.sourcesOf.get(target) ?? []),
        { id: source, qty },
      ]);
      graph.targetsOf.set(source, [
        ...(graph.targetsOf.get(source) ?? []),
        { id: target, qty },
      ]);
    }
    for (const o of origins) {
      const lot = String(o.lot_id);
      graph.origins.set(lot, [
        ...(graph.origins.get(lot) ?? []),
        {
          originId: String(o.origin_lot_id),
          qty: Number(o.qty),
          qtyRemaining: Number(o.qty_remaining),
        },
      ]);
    }
    return graph;
  }

  private async lineContext(lineId: string) {
    const rows = await this.dataSource.query<
      Array<{
        line_no: number;
        quantity: number;
        order_id: string;
        order_code: string;
        plan_code: string | null;
        product_id: string;
        product_code: string;
        product_name: string;
      }>
    >(
      `SELECT l.line_no, l.quantity, o.id AS order_id, o.code AS order_code,
              p.code AS plan_code, COALESCE(pr.id, m.id) AS product_id,
              COALESCE(pr.code, m.code) AS product_code, COALESCE(pr.name, m.name) AS product_name
       FROM inventory.production_order_lines l
       JOIN inventory.production_orders o ON o.id = l.production_order_id
       LEFT JOIN inventory.production_plans p ON p.id = o.production_plan_id
       LEFT JOIN master.products pr ON pr.id = l.product_id
       LEFT JOIN master.materials m ON m.id = l.material_id
       WHERE l.id = $1`,
      [lineId],
    );
    const r = rows[0];
    return {
      product: {
        id: String(r.product_id),
        code: r.product_code,
        name: r.product_name,
      },
      productionOrder: { id: String(r.order_id), code: r.order_code },
      productionPlan: r.plan_code,
      lineNo: Number(r.line_no),
      plannedQty: Number(r.quantity),
    };
  }

  private async packageOrigins(
    packageIds: string[],
  ): Promise<Map<string, OriginShare[]>> {
    const rows = await this.dataSource.query<
      Array<{
        package_id: string;
        lot_no: string;
        production_date: string;
        shift_key: string;
        qty: number;
      }>
    >(
      `SELECT s.package_id, l.lot_no, l.production_date::text AS production_date,
              l.shift_key, s.qty
       FROM inventory.production_package_sources s
       JOIN inventory.production_lots l ON l.id = s.origin_lot_id
       WHERE s.package_id = ANY($1::bigint[])
       ORDER BY l.production_date, l.id`,
      [packageIds],
    );
    const map = new Map<string, OriginShare[]>();
    for (const r of rows) {
      const key = String(r.package_id);
      map.set(key, [
        ...(map.get(key) ?? []),
        {
          lotNo: r.lot_no,
          productionDate: r.production_date,
          shift: r.shift_key,
          qty: Number(r.qty),
        },
      ]);
    }
    return map;
  }

  private async linePackages(lineId: string) {
    const rows = await this.dataSource.query<
      Array<{
        id: string;
        fg_lot_id: string;
        qr_code: string;
        box_no: number;
        initial_qty: number;
        status: string;
      }>
    >(
      `SELECT id, fg_lot_id, qr_code, box_no, initial_qty, status
       FROM inventory.production_packages
       WHERE production_order_line_id = $1 ORDER BY fg_lot_id, box_no`,
      [lineId],
    );
    const origins = await this.packageOrigins(rows.map((r) => String(r.id)));
    const map = new Map<string, NonNullable<TraceNode['packages']>>();
    for (const r of rows) {
      const lot = String(r.fg_lot_id);
      map.set(lot, [
        ...(map.get(lot) ?? []),
        {
          qrCode: r.qr_code,
          boxNo: Number(r.box_no),
          qty: Number(r.initial_qty),
          status: r.status,
          origins: origins.get(String(r.id)) ?? [],
        },
      ]);
    }
    return map;
  }
}
