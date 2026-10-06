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
              p.code AS plan_code, pr.id AS product_id, pr.code AS product_code,
              pr.name AS product_name
       FROM inventory.production_order_lines l
       JOIN inventory.production_orders o ON o.id = l.production_order_id
       LEFT JOIN inventory.production_plans p ON p.id = o.production_plan_id
       JOIN master.products pr ON pr.id = l.product_id
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
