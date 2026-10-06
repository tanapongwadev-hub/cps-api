/**
 * Production Lot & QR traceability — end-to-end test plan (plan §13, Case
 * 1–12) against a real PostgreSQL test database, through the real services.
 *
 * Every run creates its own LOT order (500 pcs, workflow WE → PS → CHECK →
 * INCOME-FG, 100 pcs/box), so runs never collide and nothing has to be
 * deleted. Lot numbers come from shared day counters, so the tests look lots
 * up by step/day instead of hard-coding numbers. The cases build on each
 * other and run in order.
 *
 * Run: pnpm test:production   (needs cps_db_test — refuses any other DB)
 */
import { randomUUID } from 'crypto';
import { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import {
  addDays,
  productionDayOf,
} from '../../src/modules/production/domain/production-day';
import { BoardService } from '../../src/modules/production/production-process/board.service';
import { ProcessService } from '../../src/modules/production/production-process/process.service';
import { ReconciliationService } from '../../src/modules/production/production-process/reconciliation.service';
import { ReversalService } from '../../src/modules/production/production-process/reversal.service';
import { TransferService } from '../../src/modules/production/production-process/transfer.service';
import { CloseService } from '../../src/modules/production/production-process/close.service';
import { HistoryService } from '../../src/modules/production/production-process/history.service';
import { PackageService } from '../../src/modules/production/production-package/package.service';
import { WipService } from '../../src/modules/production/production-wip/wip.service';
import { TraceabilityService } from '../../src/modules/production/traceability/traceability.service';
import {
  ProductionOrder,
  ProductionOrderLine,
} from '../../src/modules/production-orders/production-order.entity';

const USER = '1';

type Row = Record<string, unknown>;
interface TraceNodeLike {
  lotNo: string;
  processCode: string;
  links: TraceNodeLike[];
}

describe('Production lot traceability (cps_db_test)', () => {
  let app: INestApplicationContext;
  let ds: DataSource;
  let proc: ProcessService;
  let xfer: TransferService;
  let rev: ReversalService;
  let rec: ReconciliationService;
  let board: BoardService;
  let packages: PackageService;
  let trace: TraceabilityService;
  let closes: CloseService;
  let history: HistoryService;
  let lineId: string;
  let reasonId: string;

  // Day 2 = the current production day/shift; day 1 = previous day, shift A.
  const today = productionDayOf(new Date());
  const D2 = { productionDate: today.productionDate, shift: today.shift };
  const D1 = {
    productionDate: addDays(today.productionDate, -1),
    shift: 'A' as const,
  };
  const T1 = { transferDate: D1.productionDate, shift: D1.shift };
  const T2 = { transferDate: D2.productionDate, shift: D2.shift };

  const q = <T = Row>(sql: string, params: unknown[] = []) =>
    ds.query<T[]>(sql, params);
  const produce = (
    step: number,
    body: object,
    day: object,
    requestId = randomUUID(),
  ) =>
    proc.produce(
      lineId,
      step,
      { requestId, goodQty: 0, ...body, ...day },
      USER,
    );
  const transfer = (
    step: number,
    body: object,
    day: object,
    requestId = randomUUID(),
  ) =>
    xfer.transfer(lineId, step, { requestId, ...body, ...day } as never, USER);
  const steps = async () => (await board.board(lineId)).steps;
  const lotsAt = (step: number) =>
    q<{
      id: string;
      lot_no: string;
      production_date: string;
      produced_qty: number;
      remaining_qty: number;
      status: string;
    }>(
      `SELECT id, lot_no, production_date::text AS production_date, produced_qty, remaining_qty, status
       FROM inventory.production_lots WHERE production_order_line_id = $1 AND step_index = $2
       ORDER BY production_date, id`,
      [lineId, step],
    );
  const originsOf = async (lotId: string) =>
    Object.fromEntries(
      (
        await q<{ lot_no: string; qty: number; qty_remaining: number }>(
          `SELECT ol.lot_no, o.qty, o.qty_remaining FROM inventory.production_lot_origins o
           JOIN inventory.production_lots ol ON ol.id = o.origin_lot_id
           WHERE o.lot_id = $1 AND o.qty > 0`,
          [lotId],
        )
      ).map((r) => [r.lot_no, { qty: r.qty, left: r.qty_remaining }]),
    );
  const txCount = async () =>
    (
      await q<{ n: number }>(
        `SELECT COUNT(*)::int AS n FROM inventory.production_transactions WHERE production_order_line_id = $1`,
        [lineId],
      )
    )[0].n;
  const expectConflict = async (p: Promise<unknown>) => {
    await expect(p).rejects.toMatchObject({ status: 409 });
  };

  beforeAll(async () => {
    app = await NestFactory.createApplicationContext(AppModule, {
      logger: ['error'],
    });
    ds = app.get(DataSource);
    const db = (await q<{ d: string }>('SELECT current_database() AS d'))[0].d;
    if (!db.endsWith('_test')) throw new Error(`refusing to run against ${db}`);
    proc = app.get(ProcessService);
    xfer = app.get(TransferService);
    rev = app.get(ReversalService);
    rec = app.get(ReconciliationService);
    board = app.get(BoardService);
    packages = app.get(PackageService);
    trace = app.get(TraceabilityService);
    closes = app.get(CloseService);
    history = app.get(HistoryService);

    // Fixture: a product with an ACTIVE 4-step workflow ending in INCOME-FG.
    const flow = (
      await q<{ workflow_id: string; product_id: string }>(
        `SELECT w.id AS workflow_id, w.product_id FROM master.product_workflows w
         WHERE w.status = 'ACTIVE'
           AND (SELECT COUNT(*) FROM master.product_workflow_steps s WHERE s.workflow_id = w.id) = 4
           AND EXISTS (SELECT 1 FROM master.product_workflow_steps s JOIN master.process_steps p ON p.id = s.process_step_id
                       WHERE s.workflow_id = w.id AND p.receiving_type = 'FG')
         ORDER BY w.id LIMIT 1`,
      )
    )[0];
    if (!flow)
      throw new Error(
        'test DB has no ACTIVE 4-step workflow ending in an FG step',
      );

    const tag = Date.now().toString(36).toUpperCase();
    const plan = (
      await q<{ id: string }>(
        `INSERT INTO inventory.production_plans (code, status, title)
       VALUES ($1, 'ISSUED', 'e2e lot test') RETURNING id`,
        [`TP-${tag}`],
      )
    )[0];
    const order = (
      await q<{ id: string }>(
        `INSERT INTO inventory.production_orders (code, production_plan_id, tracking_model, created_by)
       VALUES ($1, $2, 'LOT', $3) RETURNING id`,
        [`TPO-${tag}`, plan.id, USER],
      )
    )[0];
    lineId = (
      await q<{ id: string }>(
        `INSERT INTO inventory.production_order_lines
         (production_order_id, line_no, product_id, workflow_id, quantity, packing_quantity)
       VALUES ($1, 1, $2, $3, 500, 100) RETURNING id`,
        [order.id, flow.product_id, flow.workflow_id],
      )
    )[0].id;

    let reason = (
      await q<{ id: string }>(
        `SELECT id FROM master.reject_reasons WHERE is_active LIMIT 1`,
      )
    )[0];
    reason ??= (
      await q<{ id: string }>(
        `INSERT INTO master.reject_reasons (code, name_th, is_active) VALUES ('E2E-NG', 'ทดสอบของเสีย', true) RETURNING id`,
      )
    )[0];
    reasonId = String(reason.id);

    const firstStep = (
      await q<{ process_step_id: string }>(
        `SELECT process_step_id FROM master.product_workflow_steps WHERE workflow_id = $1 ORDER BY sort_order LIMIT 1`,
        [flow.workflow_id],
      )
    )[0].process_step_id;
    await ds.transaction(async (m) => {
      const o = await m
        .getRepository(ProductionOrder)
        .findOneByOrFail({ id: order.id });
      const l = await m
        .getRepository(ProductionOrderLine)
        .findOneByOrFail({ id: lineId });
      await app.get(WipService).releasePlan(m, o, l, firstStep, USER);
    });
  });

  afterAll(async () => {
    await app?.close();
  });

  it('Case 1 — output over two days makes two ORIGIN lots, nothing left at WE', async () => {
    await produce(0, { goodQty: 350 }, D1);
    await produce(0, { goodQty: 150 }, D2);
    const lots = await lotsAt(0);
    expect(lots.map((l) => [l.production_date, l.produced_qty])).toEqual([
      [D1.productionDate, 350],
      [D2.productionDate, 150],
    ]);
    lots.forEach((l) => expect(l.lot_no).toMatch(/^WE-\d{6}-\d{3}$/));
    expect((await steps())[0].waitingQty).toBe(0);
  });

  it('Case 12 — the same requestId returns the first result, nothing new', async () => {
    const before = await txCount();
    const fresh = randomUUID();
    await transfer(0, { qty: 350 }, T1, fresh);
    const replay = await transfer(0, { qty: 350 }, T1, fresh);
    expect(replay.replayed).toBe(true);
    expect(await txCount()).toBe(before + 1);
  });

  it('Case 2 — WIP across days keeps each source lot apart', async () => {
    await produce(1, { goodQty: 100 }, D1);
    await transfer(0, { qty: 150 }, T2);
    const wip = await q<{ lot_no: string; left: number }>(
      `SELECT l.lot_no, SUM(w.qty_remaining)::int AS left FROM inventory.process_wip w
       JOIN inventory.production_lots l ON l.id = w.source_lot_id
       WHERE w.production_order_line_id = $1 AND w.step_index = 1 AND w.status = 'OPEN'
       GROUP BY l.lot_no, l.production_date ORDER BY l.production_date`,
      [lineId],
    );
    expect(wip.map((w) => w.left)).toEqual([250, 150]);
    expect((await steps())[1].waitingQty).toBe(400);
  });

  it('Case 3 — MANUAL merge of two source lots into one PS lot', async () => {
    const [we1, we2] = await lotsAt(0);
    const r = await produce(
      1,
      {
        goodQty: 200,
        allocationMode: 'MANUAL',
        allocations: [
          { lotId: we1.id, qty: 150 },
          { lotId: we2.id, qty: 50 },
        ],
      },
      D2,
    );
    expect(await originsOf(r.lot!.id)).toEqual({
      [we1.lot_no]: { qty: 150, left: 150 },
      [we2.lot_no]: { qty: 50, left: 50 },
    });
    const edges = await q<{ src: string; qty: number }>(
      `SELECT s.lot_no AS src, SUM(e.qty)::int AS qty FROM inventory.production_lot_sources e
       JOIN inventory.production_lots s ON s.id = e.source_lot_id
       WHERE e.target_lot_id = $1 GROUP BY s.lot_no ORDER BY s.lot_no`,
      [r.lot!.id],
    );
    expect(Object.fromEntries(edges.map((e) => [e.src, e.qty]))).toEqual({
      [we1.lot_no]: 150,
      [we2.lot_no]: 50,
    });
  });

  it('Case 4 — one WE lot splits into several PS lots (forward trace)', async () => {
    const [we1] = await lotsAt(0);
    const fwd = await trace.traceLot(we1.id, 'forward');
    const psLots = (fwd.lineage.links as TraceNodeLike[]).filter(
      (n) => n.processCode === 'PS',
    );
    expect(psLots.length).toBe(2);
    const total = (fwd.lineage.links as Array<{ edgeQty: number }>).reduce(
      (s, n) => s + n.edgeQty,
      0,
    );
    expect(total).toBeLessThanOrEqual(350);
  });

  it('Case 10 — rejects scrap WIP with a reason and their origins', async () => {
    const before = (await steps())[1].waitingQty;
    await produce(1, { goodQty: 50, rejects: [{ reasonId, qty: 10 }] }, D2);
    const s = (await steps())[1];
    expect(s.waitingQty).toBe(before - 60);
    expect(s.rejectedQty).toBe(10);
    const rej = await q<{ reason: string; origins: number }>(
      `SELECT t.reject_reason_id::text AS reason, SUM(o.qty)::int AS origins
       FROM inventory.production_transactions t
       JOIN inventory.production_transaction_origins o ON o.transaction_id = t.id
       WHERE t.production_order_line_id = $1 AND t.transaction_type = 'REJECT'
       GROUP BY t.reject_reason_id`,
      [lineId],
    );
    expect(rej).toEqual([{ reason: reasonId, origins: 10 }]);
  });

  it('Case 9 — two sessions produce at once: one wins, the other gets 409', async () => {
    const waiting = (await steps())[1].waitingQty; // 140
    const each = Math.floor(waiting / 2) + 10;
    const results = await Promise.allSettled([
      produce(1, { goodQty: each }, D2),
      produce(1, { goodQty: each }, D2),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const lost = results.find(
      (r) => r.status === 'rejected',
    ) as PromiseRejectedResult;
    expect(lost.reason).toMatchObject({ status: 409 });
    expect((await steps())[1].waitingQty).toBe(waiting - each);
  });

  it('Case 8 — over-draws are rejected and leave nothing behind', async () => {
    const before = await txCount();
    const s = await steps();
    const [we1] = await lotsAt(0);
    await expectConflict(produce(1, { goodQty: s[1].waitingQty + 1 }, D2));
    await expectConflict(transfer(1, { qty: s[1].readyQty + 1 }, T2));
    await expectConflict(
      produce(
        1,
        {
          goodQty: 999,
          allocationMode: 'MANUAL',
          allocations: [{ lotId: we1.id, qty: 999 }],
        },
        D2,
      ),
    );
    expect(await txCount()).toBe(before);
  });

  it('Case 5 — partial transfer leaves the rest ready, origins taken oldest first', async () => {
    const ps = await lotsAt(1);
    const psD2 = ps.find((l) => l.production_date === D2.productionDate)!;
    const before = await originsOf(psD2.id);
    await transfer(
      1,
      {
        qty: 150,
        allocationMode: 'MANUAL',
        allocations: [{ lotId: psD2.id, qty: 150 }],
      },
      T2,
    );
    const after = (await lotsAt(1)).find((l) => l.id === psD2.id)!;
    expect(after.remaining_qty).toBe(psD2.remaining_qty - 150);
    const left = await originsOf(psD2.id);
    const taken = Object.fromEntries(
      Object.entries(before).map(([lot, o]) => [lot, o.left - left[lot].left]),
    );
    const [we1, we2] = (await lotsAt(0)).map((l) => l.lot_no);
    // The older origin is used up before the newer one is touched.
    if (taken[we2] > 0) expect(left[we1].left).toBe(0);
    expect(taken[we1] + (taken[we2] ?? 0)).toBe(150);
    expect(Object.values(left).reduce((s, o) => s + o.left, 0)).toBe(
      after.remaining_qty,
    );
  });

  it('Case 6 — FG 150 packs into BOX001 100 FULL + BOX002 50 PARTIAL', async () => {
    await produce(2, { goodQty: 150 }, D2);
    await transfer(2, { qty: 150 }, T2);
    const fg = await produce(3, { goodQty: 150 }, D2);
    expect(fg.lot!.lotType).toBe('FG');
    const res = await packages.generate(
      { requestId: randomUUID(), fgLotId: fg.lot!.id, qty: 150, packSize: 100 },
      USER,
    );
    expect(
      res.packages.map((p) => [p.boxNo, p.initialQty, p.unitType]),
    ).toEqual([
      [1, 100, 'FULL'],
      [2, 50, 'PARTIAL'],
    ]);
    expect(res.packages[0].qrCode).toMatch(/^QR-FG-\d{6}-\d{3}-BOX001$/);
  });

  it('Case 7 — scanning BOX001 traces FG → CHECK → PS → WE and the order', async () => {
    const box = (
      await q<{ qr_code: string }>(
        `SELECT qr_code FROM inventory.production_packages WHERE production_order_line_id = $1 AND box_no = 1`,
        [lineId],
      )
    )[0];
    const scan = await trace.scan(box.qr_code);
    expect(scan.kind).toBe('PACKAGE');
    if (scan.kind !== 'PACKAGE') return;
    expect(scan.origins.reduce((s, o) => s + o.qty, 0)).toBe(100);
    expect(scan.productionOrder.code).toMatch(/^TPO-/);
    const path: string[] = [];
    let node: TraceNodeLike | undefined = scan.lineage;
    while (node) {
      path.push(node.processCode);
      node = node.links[0];
    }
    expect(path).toEqual(['INCOME-FG', 'CHECK', 'PS', 'WE']);
  });

  it('Case 11 — reversal works while pieces are untouched, 409 once they moved on', async () => {
    const [we1] = await lotsAt(0);
    const firstWe = (
      await q<{ request_id: string }>(
        `SELECT request_id FROM inventory.production_transactions
       WHERE target_lot_id = $1 AND transaction_type = 'PROCESS_OUTPUT' LIMIT 1`,
        [we1.id],
      )
    )[0];
    await expectConflict(
      rev.reverse(
        lineId,
        firstWe.request_id,
        { requestId: randomUUID(), reason: 'e2e' },
        USER,
      ),
    );

    const id = randomUUID();
    const before = (await steps())[1];
    await produce(1, { goodQty: 5 }, D2, id);
    const undo = await rev.reverse(
      lineId,
      id,
      { requestId: randomUUID(), reason: 'e2e' },
      USER,
    );
    expect(undo.movements).toEqual([
      expect.objectContaining({ type: 'PROCESS_OUTPUT', qty: 5 }),
    ]);
    const after = (await steps())[1];
    expect([after.waitingQty, after.producedQty]).toEqual([
      before.waitingQty,
      before.producedQty,
    ]);
  });

  it('reconciliation — the whole line agrees with its ledger and origins', async () => {
    const r = await rec.reconcile(lineId);
    expect(r.issues).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('close remaining — closes waiting pieces with a reason, and can be reversed', async () => {
    const before = (await steps())[1];
    expect(before.waitingQty).toBeGreaterThan(0);
    const id = randomUUID();
    const r = await closes.closeRemaining(
      lineId,
      1,
      { requestId: id, qty: 1, reason: 'e2e: วัตถุดิบไม่พอ' },
      USER,
    );
    expect([r.closedQty, r.step.waitingQty]).toEqual([
      1,
      before.waitingQty - 1,
    ]);
    expect((await steps())[1].closedQty).toBe(before.closedQty + 1);
    await rev.reverse(
      lineId,
      id,
      { requestId: randomUUID(), reason: 'e2e' },
      USER,
    );
    const after = (await steps())[1];
    expect([after.waitingQty, after.closedQty]).toEqual([
      before.waitingQty,
      before.closedQty,
    ]);
    expect((await rec.reconcile(lineId)).issues).toEqual([]);
  });

  it('history — lists requests newest first with reversed/reversible flags', async () => {
    const id = randomUUID();
    await produce(1, { goodQty: 1 }, D2, id);
    let h = await history.history(lineId);
    expect(h[0]).toMatchObject({
      requestId: id,
      kind: 'PRODUCE',
      goodQty: 1,
      reversed: false,
      reversible: true,
    });
    await rev.reverse(
      lineId,
      id,
      { requestId: randomUUID(), reason: 'e2e' },
      USER,
    );
    h = await history.history(lineId);
    expect(h.find((e) => e.requestId === id)).toMatchObject({
      reversed: true,
      reversible: false,
    });
    // A transfer whose pieces were already used further on is listed but not reversible.
    expect(
      h.some((e) => e.kind === 'TRANSFER' && !e.reversed && !e.reversible),
    ).toBe(true);
    expect(h.some((e) => e.kind === 'RECEIVE')).toBe(true);
  });

  it('Case 13 — the order completes once every piece is received, rejected or closed', async () => {
    const orderStatus = async () =>
      (
        await q<{ status: string }>(
          `SELECT o.status FROM inventory.production_orders o
         JOIN inventory.production_order_lines l ON l.production_order_id = o.id WHERE l.id = $1`,
          [lineId],
        )
      )[0].status;

    // Wind the line down: WE/PS close what still waits and send on what is
    // ready; CHECK produces everything it holds; FG receives it.
    for (let s = 0; s < 3; s += 1) {
      const step = (await steps())[s];
      if (step.waitingQty > 0) {
        if (s < 2) {
          await closes.closeRemaining(
            lineId,
            s,
            { requestId: randomUUID(), reason: 'e2e: ปิดยอด' },
            USER,
          );
        } else {
          await produce(s, { goodQty: step.waitingQty }, D2);
        }
      }
      const ready = (await steps())[s].readyQty;
      if (ready > 0) await transfer(s, { qty: ready }, T2);
    }
    const fgWaiting = (await steps())[3].waitingQty;
    expect(fgWaiting).toBeGreaterThan(0);
    await produce(3, { goodQty: fgWaiting }, D2);
    // Received but not packed yet → still in progress.
    expect(await orderStatus()).toBe('IN_PROGRESS');
    const fgOpen = (await lotsAt(3)).filter((l) => l.remaining_qty > 0);
    expect(fgOpen.length).toBeGreaterThan(0);
    for (const lot of fgOpen) {
      await packages.generate(
        { requestId: randomUUID(), fgLotId: lot.id, packSize: 100 },
        USER,
      );
    }

    expect(await orderStatus()).toBe('COMPLETED');
    const line = (
      await q<{
        quantity: number;
        received_qty: number;
        rejected_qty: number;
        short_closed_quantity: number;
      }>(
        `SELECT quantity, received_qty, rejected_qty, short_closed_quantity FROM inventory.production_order_lines WHERE id = $1`,
        [lineId],
      )
    )[0];
    expect(
      line.received_qty + line.rejected_qty + line.short_closed_quantity,
    ).toBe(line.quantity);
    expect((await rec.reconcile(lineId)).issues).toEqual([]);
    // No new movement on a completed order.
    await expectConflict(
      closes.closeRemaining(
        lineId,
        0,
        { requestId: randomUUID(), reason: 'e2e' },
        USER,
      ),
    );
  });
  it('void packing — boxes become VOID, pieces return to the lot, a completed order reopens', async () => {
    const last = (
      await q<{ request_id: string; qty: number }>(
        `SELECT request_id, SUM(qty)::int AS qty FROM inventory.production_transactions
         WHERE production_order_line_id = $1 AND transaction_type = 'PACKING'
         GROUP BY request_id ORDER BY MAX(id) DESC LIMIT 1`,
        [lineId],
      )
    )[0];
    const orderStatus = async () =>
      (
        await q<{ status: string }>(
          `SELECT o.status FROM inventory.production_orders o
           JOIN inventory.production_order_lines l ON l.production_order_id = o.id WHERE l.id = $1`,
          [lineId],
        )
      )[0].status;
    expect(await orderStatus()).toBe('COMPLETED');
    const before = (
      await q<{ remaining: number }>(
        `SELECT COALESCE(SUM(remaining_qty), 0)::int AS remaining FROM inventory.production_lots
         WHERE production_order_line_id = $1 AND lot_type = 'FG'`,
        [lineId],
      )
    )[0].remaining;

    const id = randomUUID();
    const res = await rev.reverse(
      lineId,
      last.request_id,
      { requestId: id, reason: 'e2e: แพ็กผิด' },
      USER,
    );
    expect(res.movements.every((m) => m.type === 'PACKING')).toBe(true);
    const voided = await q<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM inventory.production_packages p
       JOIN inventory.production_transactions t ON t.package_id = p.id
       WHERE t.request_id = $1 AND t.transaction_type = 'PACKING' AND p.status = 'VOID' AND p.current_qty = 0`,
      [last.request_id],
    );
    expect(voided[0].n).toBeGreaterThan(0);
    const after = (
      await q<{ remaining: number }>(
        `SELECT COALESCE(SUM(remaining_qty), 0)::int AS remaining FROM inventory.production_lots
         WHERE production_order_line_id = $1 AND lot_type = 'FG'`,
        [lineId],
      )
    )[0].remaining;
    expect(after).toBe(before + Number(last.qty));
    expect(await orderStatus()).toBe('IN_PROGRESS');
    expect((await rec.reconcile(lineId)).issues).toEqual([]);

    // Replay returns the same result; a second reversal is refused.
    const again = await rev.reverse(
      lineId,
      last.request_id,
      { requestId: id, reason: 'e2e: แพ็กผิด' },
      USER,
    );
    expect(again.replayed).toBe(true);
    await expectConflict(
      rev.reverse(
        lineId,
        last.request_id,
        { requestId: randomUUID(), reason: 'e2e' },
        USER,
      ),
    );

    // The lot can be packed again; the voided box numbers stay taken.
    const [fg] = await q<{ id: string }>(
      `SELECT id FROM inventory.production_lots
       WHERE production_order_line_id = $1 AND lot_type = 'FG' AND remaining_qty > 0 LIMIT 1`,
      [lineId],
    );
    await packages.generate(
      { requestId: randomUUID(), fgLotId: fg.id, packSize: 100 },
      USER,
    );
    expect(await orderStatus()).toBe('COMPLETED');
    expect((await rec.reconcile(lineId)).issues).toEqual([]);
  });
  it('transfer tags — every transfer gets a QR that tells where the batch is now', async () => {
    const wips = await q<{ id: string; qr_code: string; step_index: number }>(
      `SELECT id, qr_code, step_index FROM inventory.process_wip
       WHERE production_order_line_id = $1 AND source_lot_id IS NOT NULL ORDER BY id`,
      [lineId],
    );
    expect(wips.length).toBeGreaterThan(0);
    for (const w of wips) {
      expect(w.qr_code).toMatch(/^TQ-.+-S\d+-\d{2}$/);
    }
    expect(new Set(wips.map((w) => w.qr_code)).size).toBe(wips.length);

    const tag = wips[0];
    const scan = (await trace.scan(tag.qr_code)) as unknown as {
      kind: string;
      qty: number;
      waitingQty: number;
      producedQty: number;
      rejectedQty: number;
      closedQty: number;
      toStep: { stepIndex: number };
      lineage: { lotNo: string };
      origins: Array<{ qty: number }>;
    };
    expect(scan.kind).toBe('TRANSFER');
    expect(scan.toStep.stepIndex).toBe(Number(tag.step_index));
    expect(
      scan.waitingQty + scan.producedQty + scan.rejectedQty + scan.closedQty,
    ).toBe(scan.qty);
    expect(scan.origins.reduce((n, o) => n + o.qty, 0)).toBe(scan.qty);

    // Boxes: one QR per pack of the batch, computed from the WIP row.
    const list = await board.tags(lineId, Number(tag.step_index));
    const mine = list.filter((t) => t.batchQr === tag.qr_code);
    expect(mine.length).toBeGreaterThan(0);
    for (const b of mine) {
      expect(b.qrCode).toBe(
        `${tag.qr_code}-B${String(b.boxNo).padStart(3, '0')}`,
      );
      expect(b.qrImage).toMatch(/^data:image\/svg\+xml/);
      expect(b.origins.reduce((n, o) => n + o.qty, 0)).toBe(b.qty);
    }
    expect(mine.reduce((n, b) => n + b.qty, 0)).toBe(scan.qty);
    expect(mine.slice(0, -1).every((b) => b.qty === 100)).toBe(true);

    const boxScan = (await trace.scan(mine[0].qrCode)) as unknown as {
      kind: string;
      box: { boxNo: number; qty: number; boxCount: number } | null;
      boxes: unknown[];
    };
    expect(boxScan.kind).toBe('TRANSFER');
    expect(boxScan.box?.boxNo).toBe(1);
    expect(boxScan.box?.qty).toBe(mine[0].qty);
    expect(boxScan.boxes).toHaveLength(mine.length);
  });
});
