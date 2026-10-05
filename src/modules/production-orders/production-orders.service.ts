import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import * as QRCode from 'qrcode';
import { DataSource, EntityManager } from 'typeorm';
import { recordAuditEvent } from '../../common/stock-ledger';
import {
  ProductWorkflow,
  ProductWorkflowStatus,
} from '../../entities/master/product-workflow.entity';
import { Product } from '../../entities/master/product.entity';
import { MaterialJobOrder } from '../material-job-orders/material-job-order.entity';
import { ProductionPlan } from '../production-plans/production-plan.entity';
import { CreateProductionOrderDto } from './dto/create-production-order.dto';
import { ListProductionOrdersQueryDto } from './dto/list-production-orders-query.dto';
import { CloseRemainingDto, RecordOutputDto } from './dto/record-output.dto';
import {
  PRODUCTION_ORDER_STATUSES,
  ProductionOrder,
  ProductionOrderLine,
  ProductionOrderOutput,
  ProductionOrderPacket,
  ProductionOrderPacketEvent,
} from './production-order.entity';

export interface OutputView {
  id: string;
  quantity: number;
  boxCount: number;
  workDate: string;
  shift: string | null;
  remark: string | null;
  performedAt: Date;
  performedBy: string | null;
}

/** Today's date (YYYY-MM-DD) on the factory clock, Asia/Bangkok (UTC+7). */
function bangkokToday(): string {
  return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
}

export interface StepView {
  index: number;
  code: string;
  name: string;
}

// A packet's QR content never changes, so its SVG image is cached in-process
// instead of being regenerated for every page load (~300 per large order).
// Bounded FIFO so a long-running process can't grow it without limit.
const QR_CACHE_LIMIT = 20_000;
const qrCache = new Map<string, string>();

async function qrDataUrl(content: string): Promise<string> {
  const cached = qrCache.get(content);
  if (cached) return cached;
  const svg = await QRCode.toString(content, { type: 'svg', margin: 1 });
  const url = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  if (qrCache.size >= QR_CACHE_LIMIT) {
    const oldest: IteratorResult<string> = qrCache.keys().next();
    if (!oldest.done) qrCache.delete(oldest.value);
  }
  qrCache.set(content, url);
  return url;
}

export interface PacketTimelineEvent {
  fromStepIndex: number | null;
  toStepIndex: number;
  performedAt: Date;
  performedBy: string | null;
}

@Injectable()
export class ProductionOrdersService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  // ----------------------------------------------------------------- create

  async create(dto: CreateProductionOrderDto, userId: string) {
    const orderId = await this.dataSource.transaction(async (manager) => {
      const plan = await manager.getRepository(ProductionPlan).findOne({
        where: { id: dto.productionPlanId },
        relations: ['lines'],
      });
      if (!plan) {
        throw new NotFoundException(
          `ไม่พบแผนการผลิต id ${dto.productionPlanId}`,
        );
      }
      const jobOrder = await manager
        .getRepository(MaterialJobOrder)
        .findOne({ where: { productionPlanId: plan.id } });
      if (plan.status !== 'ISSUED' || jobOrder?.status !== 'ISSUED') {
        throw new ConflictException(
          'สั่งผลิตได้เฉพาะแผนที่ใบจัดงานจ่ายวัตถุดิบออกครบแล้ว',
        );
      }
      const existing = await manager
        .getRepository(ProductionOrder)
        .findOne({ where: { productionPlanId: plan.id } });
      if (existing) {
        throw new ConflictException(
          `แผนนี้สั่งผลิตแล้ว (ใบสั่งผลิต ${existing.code})`,
        );
      }

      const code = await this.allocateCode(manager, new Date());
      const orderRepo = manager.getRepository(ProductionOrder);
      const order = await orderRepo.save(
        orderRepo.create({
          code,
          productionPlanId: plan.id,
          status: 'IN_PROGRESS',
          createdBy: userId,
        }),
      );

      const lines = [...plan.lines].sort((a, b) => Number(a.id) - Number(b.id));
      let lineNo = 0;
      let totalQuantity = 0;
      for (const planLine of lines) {
        lineNo += 1;
        const product = await manager
          .getRepository(Product)
          .findOne({ where: { id: planLine.productId } });
        if (!product) {
          throw new NotFoundException(`ไม่พบสินค้า id ${planLine.productId}`);
        }
        const workflow = await manager.getRepository(ProductWorkflow).findOne({
          where: {
            productId: product.id,
            status: ProductWorkflowStatus.ACTIVE,
          },
          relations: ['steps'],
        });
        if (!workflow || workflow.steps.length === 0) {
          throw new ConflictException(
            `สินค้า ${product.code} ยังไม่มีกระบวนการผลิตที่เปิดใช้งาน กรุณาตั้งค่าและเปิดใช้งานก่อนสั่งผลิต`,
          );
        }

        const packing =
          Number(product.packing) > 0
            ? Math.floor(Number(product.packing))
            : planLine.quantity;
        // No boxes / QR yet: the whole line quantity is on hold at the first
        // workflow step until real output is reported (recordOutput).
        const lineRepo = manager.getRepository(ProductionOrderLine);
        await lineRepo.save(
          lineRepo.create({
            productionOrderId: order.id,
            lineNo,
            productId: product.id,
            workflowId: workflow.id,
            quantity: planLine.quantity,
            packingQuantity: packing,
          }),
        );
        totalQuantity += planLine.quantity;
      }

      await recordAuditEvent(manager, {
        traceId: code,
        action: 'CREATE',
        targetType: 'PRODUCTION_ORDER',
        targetId: order.id,
        performedBy: userId,
        after: {
          code,
          productionPlanId: plan.id,
          quantity: totalQuantity,
        },
      });
      return order.id;
    });
    return this.findOne(orderId);
  }

  // ---------------------------------------------------------------- advance

  /**
   * Moves a box to its next workflow step. With `quantity` below the box
   * quantity, only that part was actually produced at this step: it is split
   * off into a new box (new QR, inheriting the parent's history) that moves
   * on, while the remainder keeps its QR and stays on hold at this step to be
   * produced later — the same rule as the first step's line hold.
   *
   * Returns only what changed (the box, any new box, order counters) — NOT
   * the full order: re-reading every box and regenerating hundreds of QR
   * images per scan made each click take seconds on large orders.
   */
  async advancePacket(packetId: string, userId: string, quantity?: number) {
    return this.dataSource.transaction(async (manager) => {
      const packetRepo = manager.getRepository(ProductionOrderPacket);
      const packet = await packetRepo.findOne({
        where: { id: packetId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!packet) {
        throw new NotFoundException(`ไม่พบกล่อง id ${packetId}`);
      }
      if (packet.status === 'COMPLETED') {
        throw new ConflictException('กล่องนี้ผ่านทุกขั้นตอนแล้ว');
      }
      if (quantity !== undefined && quantity > packet.quantity) {
        throw new ConflictException(
          `จำนวนเกินที่อยู่ในกล่อง (มี ${packet.quantity} ชิ้น)`,
        );
      }
      const line = await manager
        .getRepository(ProductionOrderLine)
        .findOneOrFail({ where: { id: packet.productionOrderLineId } });
      const steps = await this.loadSteps(manager, line.workflowId);
      const total = steps.length;
      const now = new Date();
      const from = packet.currentStepIndex;
      const to = Math.min(from + 1, total);
      const done = to >= total;
      const split = quantity !== undefined && quantity < packet.quantity;
      const eventRepo = manager.getRepository(ProductionOrderPacketEvent);

      let child: ProductionOrderPacket | null = null;
      if (split) {
        const order = await manager
          .getRepository(ProductionOrder)
          .findOneOrFail({ where: { id: line.productionOrderId } });
        // Remainder stays at this step with the original QR.
        packet.quantity -= quantity;
        packet.unitType =
          packet.quantity < line.packingQuantity ? 'PARTIAL' : 'FULL';
        await packetRepo.save(packet);

        const lastNo = (await manager.query(
          `SELECT COALESCE(MAX(packet_no), 0)::int AS last_no
           FROM inventory.production_order_packets
           WHERE production_order_line_id = $1`,
          [line.id],
        )) as unknown as Array<{ last_no: number }>;
        const packetNo = lastNo[0].last_no + 1;
        child = await packetRepo.save(
          packetRepo.create({
            productionOrderLineId: line.id,
            packetNo,
            qrCode: `${order.code}-L${line.lineNo}-${String(packetNo).padStart(3, '0')}`,
            quantity,
            unitType: quantity < line.packingQuantity ? 'PARTIAL' : 'FULL',
            productionOrderOutputId: packet.productionOrderOutputId,
            parentPacketId: packet.id,
            currentStepIndex: to,
            status: done ? 'COMPLETED' : 'IN_PROGRESS',
            stepUpdatedAt: now,
            stepUpdatedBy: userId,
          }),
        );
        // The split-off part has the same history up to now.
        await manager.query(
          `INSERT INTO inventory.production_order_packet_events
             (production_order_packet_id, from_step_index, to_step_index, performed_by, performed_at)
           SELECT $1, from_step_index, to_step_index, performed_by, performed_at
           FROM inventory.production_order_packet_events
           WHERE production_order_packet_id = $2`,
          [child.id, packet.id],
        );
        await eventRepo.insert({
          productionOrderPacketId: child.id,
          fromStepIndex: from,
          toStepIndex: to,
          performedBy: userId,
          performedAt: now,
        });
      } else {
        packet.currentStepIndex = to;
        if (done) packet.status = 'COMPLETED';
        packet.stepUpdatedAt = now;
        packet.stepUpdatedBy = userId;
        await packetRepo.save(packet);
        await eventRepo.insert({
          productionOrderPacketId: packet.id,
          fromStepIndex: from,
          toStepIndex: to,
          performedBy: userId,
          // Written from JS like every other timestamp the app sets, so the
          // timeline never mixes DB-session-local and UTC wall clocks.
          performedAt: now,
        });
      }

      const { order, packetCount, completedPacketCount } =
        await this.refreshOrderStatus(manager, line.productionOrderId);

      await recordAuditEvent(manager, {
        traceId: order.code,
        action: 'UPDATE',
        eventName: split
          ? 'production_order.packet_split'
          : 'production_order.step_advanced',
        targetType: 'PRODUCTION_ORDER',
        targetId: order.id,
        performedBy: userId,
        before: { qrCode: packet.qrCode, stepIndex: from },
        after: child
          ? {
              qrCode: packet.qrCode,
              stepIndex: from,
              remainingQuantity: packet.quantity,
              splitQrCode: child.qrCode,
              splitQuantity: child.quantity,
              splitStepIndex: to,
            }
          : {
              qrCode: packet.qrCode,
              stepIndex: packet.currentStepIndex,
              status: packet.status,
            },
      });

      const ids = child ? [packet.id, child.id] : [packet.id];
      const timeline = await this.loadTimeline(
        manager,
        'e.production_order_packet_id = ANY($1::bigint[])',
        [ids],
      );
      return {
        orderId: order.id,
        orderStatus: order.status,
        packetCount,
        completedPacketCount,
        packet: {
          id: packet.id,
          quantity: packet.quantity,
          unitType: packet.unitType,
          status: packet.status,
          currentStepIndex: packet.currentStepIndex,
          currentStep:
            packet.status === 'COMPLETED'
              ? null
              : (steps[packet.currentStepIndex] ?? null),
          stepUpdatedAt: packet.stepUpdatedAt,
          timeline: timeline.get(String(packet.id)) ?? [],
        },
        newPacket: child
          ? await this.toPacketView(
              child,
              steps,
              timeline.get(String(child.id)) ?? [],
            )
          : null,
      };
    });
  }

  // ------------------------------------------------------------ line hold

  /**
   * "บันทึกผลผลิต" at the first workflow step: the reported quantity (never
   * more than what is still on hold) becomes real boxes — full boxes of the
   * packing quantity plus one partial remainder box — each with its own QR,
   * already handed over to the next step. The rest stays on hold.
   */
  async recordOutput(lineId: string, dto: RecordOutputDto, userId: string) {
    const today = bangkokToday();
    const workDate = dto.workDate ?? today;
    if (workDate > today) {
      throw new ConflictException('วันที่ผลิตต้องไม่เป็นวันในอนาคต');
    }
    return this.dataSource.transaction(async (manager) => {
      const line = await this.lockOpenLine(manager, lineId);
      const steps = await this.loadSteps(manager, line.workflowId);
      const produced = await this.producedQuantity(manager, line.id);
      const remaining = line.quantity - produced - line.shortClosedQuantity;
      if (dto.quantity > remaining) {
        throw new ConflictException(
          `ผลผลิตเกินยอดค้าง (ค้างอยู่ ${remaining} ชิ้น)`,
        );
      }

      const order = await manager
        .getRepository(ProductionOrder)
        .findOneOrFail({ where: { id: line.productionOrderId } });
      const now = new Date();
      const packing = line.packingQuantity;
      const fullCount = Math.floor(dto.quantity / packing);
      const rest = dto.quantity - fullCount * packing;
      const quantities = [
        ...Array.from({ length: fullCount }, () => packing),
        ...(rest > 0 ? [rest] : []),
      ];

      const output = await manager.getRepository(ProductionOrderOutput).save({
        productionOrderLineId: line.id,
        stepIndex: 0,
        quantity: dto.quantity,
        boxCount: quantities.length,
        workDate,
        shift: dto.shift?.trim() || null,
        remark: dto.remark?.trim() || null,
        performedBy: userId,
        performedAt: now,
      });

      const lastNo = (await manager.query(
        `SELECT COALESCE(MAX(packet_no), 0)::int AS last_no
         FROM inventory.production_order_packets
         WHERE production_order_line_id = $1`,
        [line.id],
      )) as unknown as Array<{ last_no: number }>;
      // Output of the first step = the box has finished step 0.
      const nextStep = Math.min(1, steps.length);
      const done = nextStep >= steps.length;
      const packetRepo = manager.getRepository(ProductionOrderPacket);
      const packets: ProductionOrderPacket[] = [];
      let packetNo = lastNo[0].last_no;
      for (const quantity of quantities) {
        packetNo += 1;
        packets.push(
          await packetRepo.save(
            packetRepo.create({
              productionOrderLineId: line.id,
              packetNo,
              qrCode: `${order.code}-L${line.lineNo}-${String(packetNo).padStart(3, '0')}`,
              quantity,
              unitType: quantity < packing ? 'PARTIAL' : 'FULL',
              productionOrderOutputId: output.id,
              currentStepIndex: done ? steps.length : nextStep,
              status: done ? 'COMPLETED' : 'IN_PROGRESS',
              stepUpdatedAt: now,
              stepUpdatedBy: userId,
            }),
          ),
        );
      }
      await manager.getRepository(ProductionOrderPacketEvent).insert(
        packets.flatMap((packet) => [
          {
            productionOrderPacketId: packet.id,
            fromStepIndex: null,
            toStepIndex: 0,
            performedBy: userId,
            performedAt: now,
          },
          {
            productionOrderPacketId: packet.id,
            fromStepIndex: 0,
            toStepIndex: packet.currentStepIndex,
            performedBy: userId,
            performedAt: now,
          },
        ]),
      );

      const status = await this.refreshOrderStatus(manager, order.id);
      await recordAuditEvent(manager, {
        traceId: order.code,
        action: 'CREATE',
        eventName: 'production_order.output_recorded',
        targetType: 'PRODUCTION_ORDER',
        targetId: order.id,
        performedBy: userId,
        after: {
          lineNo: line.lineNo,
          quantity: dto.quantity,
          workDate,
          shift: output.shift,
          boxes: packets.map((p) => p.qrCode),
          remainingAfter: remaining - dto.quantity,
        },
      });

      const timeline = await this.loadTimeline(
        manager,
        'e.production_order_packet_id = ANY($1::bigint[])',
        [packets.map((p) => p.id)],
      );
      return {
        orderId: order.id,
        orderStatus: status.order.status,
        packetCount: status.packetCount,
        completedPacketCount: status.completedPacketCount,
        line: {
          id: line.id,
          producedQuantity: produced + dto.quantity,
          shortClosedQuantity: line.shortClosedQuantity,
          remainingQuantity: remaining - dto.quantity,
        },
        output: await this.outputView(manager, output.id),
        packets: await Promise.all(
          packets.map((p) =>
            this.toPacketView(p, steps, timeline.get(String(p.id)) ?? []),
          ),
        ),
      };
    });
  }

  /**
   * "ปิดยอดค้าง": the remaining on-hold quantity will not be produced. The
   * plan quantity itself is kept as-is (history); the closed amount and its
   * reason are recorded on the line and in the audit log.
   */
  async closeRemaining(lineId: string, dto: CloseRemainingDto, userId: string) {
    return this.dataSource.transaction(async (manager) => {
      const line = await this.lockOpenLine(manager, lineId);
      const produced = await this.producedQuantity(manager, line.id);
      const remaining = line.quantity - produced - line.shortClosedQuantity;
      if (remaining <= 0) {
        throw new ConflictException('รายการนี้ไม่มียอดค้างให้ปิด');
      }
      line.shortClosedQuantity += remaining;
      line.shortCloseReason = dto.reason.trim();
      line.shortClosedAt = new Date();
      line.shortClosedBy = userId;
      await manager.getRepository(ProductionOrderLine).save(line);

      const status = await this.refreshOrderStatus(
        manager,
        line.productionOrderId,
      );
      await recordAuditEvent(manager, {
        traceId: status.order.code,
        action: 'UPDATE',
        eventName: 'production_order.remaining_closed',
        targetType: 'PRODUCTION_ORDER',
        targetId: status.order.id,
        performedBy: userId,
        before: { lineNo: line.lineNo, remaining },
        after: {
          lineNo: line.lineNo,
          closedQuantity: remaining,
          reason: line.shortCloseReason,
        },
      });
      return {
        orderId: status.order.id,
        orderStatus: status.order.status,
        packetCount: status.packetCount,
        completedPacketCount: status.completedPacketCount,
        line: {
          id: line.id,
          producedQuantity: produced,
          shortClosedQuantity: line.shortClosedQuantity,
          shortCloseReason: line.shortCloseReason,
          shortClosedAt: line.shortClosedAt,
          remainingQuantity: 0,
        },
      };
    });
  }

  private async lockOpenLine(manager: EntityManager, lineId: string) {
    const line = await manager.getRepository(ProductionOrderLine).findOne({
      where: { id: lineId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!line) throw new NotFoundException(`ไม่พบรายการสั่งผลิต id ${lineId}`);
    const order = await manager
      .getRepository(ProductionOrder)
      .findOneOrFail({ where: { id: line.productionOrderId } });
    if (order.status === 'COMPLETED') {
      throw new ConflictException('ใบสั่งผลิตนี้เสร็จสิ้นแล้ว');
    }
    return line;
  }

  private async producedQuantity(manager: EntityManager, lineId: string) {
    const rows = (await manager.query(
      `SELECT COALESCE(SUM(quantity), 0)::int AS produced
       FROM inventory.production_order_packets
       WHERE production_order_line_id = $1`,
      [lineId],
    )) as unknown as Array<{ produced: number }>;
    return rows[0].produced;
  }

  private async loadSteps(
    manager: EntityManager,
    workflowId: string,
  ): Promise<StepView[]> {
    const workflow = await manager.getRepository(ProductWorkflow).findOne({
      where: { id: workflowId },
      relations: ['steps', 'steps.processStep'],
    });
    return [...(workflow?.steps ?? [])]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((step, index) => ({
        index,
        code: step.processStep.code,
        name: step.processStep.nameTh,
      }));
  }

  /**
   * An order is complete once every box finished every step AND no line has
   * plan quantity left on hold (all of it produced or closed short).
   */
  private async refreshOrderStatus(manager: EntityManager, orderId: string) {
    const rows = (await manager.query(
      `SELECT
         (SELECT COUNT(*) FROM inventory.production_order_packets p
            JOIN inventory.production_order_lines l ON l.id = p.production_order_line_id
           WHERE l.production_order_id = $1)::int AS total,
         (SELECT COUNT(*) FROM inventory.production_order_packets p
            JOIN inventory.production_order_lines l ON l.id = p.production_order_line_id
           WHERE l.production_order_id = $1 AND p.status = 'COMPLETED')::int AS completed,
         (SELECT COALESCE(SUM(l.quantity - l.short_closed_quantity - COALESCE(
                   (SELECT SUM(p.quantity) FROM inventory.production_order_packets p
                     WHERE p.production_order_line_id = l.id), 0)), 0)
            FROM inventory.production_order_lines l
           WHERE l.production_order_id = $1)::int AS remaining`,
      [orderId],
    )) as unknown as Array<{
      total: number;
      completed: number;
      remaining: number;
    }>;
    const { total, completed, remaining } = rows[0];
    const repo = manager.getRepository(ProductionOrder);
    const order = await repo.findOneOrFail({ where: { id: orderId } });
    if (remaining <= 0 && completed === total && order.status !== 'COMPLETED') {
      order.status = 'COMPLETED';
      order.completedAt = new Date();
      await repo.save(order);
    }
    return { order, packetCount: total, completedPacketCount: completed };
  }

  private async toPacketView(
    packet: ProductionOrderPacket,
    steps: StepView[],
    timeline: PacketTimelineEvent[],
  ) {
    return {
      id: packet.id,
      packetNo: packet.packetNo,
      qrCode: packet.qrCode,
      // SVG instead of PNG: ~15x faster to generate for orders with
      // hundreds of packets, and stays sharp when printed.
      qrImage: await qrDataUrl(packet.qrCode),
      quantity: packet.quantity,
      unitType: packet.unitType,
      outputId: packet.productionOrderOutputId,
      parentPacketId: packet.parentPacketId,
      status: packet.status,
      currentStepIndex: packet.currentStepIndex,
      currentStep:
        packet.status === 'COMPLETED'
          ? null
          : (steps[packet.currentStepIndex] ?? null),
      stepUpdatedAt: packet.stepUpdatedAt,
      timeline,
    };
  }

  /** Output reports (with performer name), newest first, grouped by line. */
  private async loadOutputs(
    manager: EntityManager,
    where: string,
    params: unknown[],
  ): Promise<Map<string, OutputView[]>> {
    const rows = (await manager.query(
      `SELECT o.id, o.production_order_line_id AS line_id, o.quantity,
              o.box_count, to_char(o.work_date, 'YYYY-MM-DD') AS work_date,
              o.shift, o.remark, o.performed_at,
              NULLIF(TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), '') AS full_name,
              u.username
       FROM inventory.production_order_outputs o
       LEFT JOIN iam.users u ON u.id = o.performed_by
       WHERE ${where}
       ORDER BY o.performed_at DESC, o.id DESC`,
      params,
    )) as unknown as Array<{
      id: string;
      line_id: string;
      quantity: number;
      box_count: number;
      work_date: string;
      shift: string | null;
      remark: string | null;
      performed_at: Date;
      full_name: string | null;
      username: string | null;
    }>;
    const byLine = new Map<string, OutputView[]>();
    for (const row of rows) {
      const list = byLine.get(String(row.line_id)) ?? [];
      list.push({
        id: String(row.id),
        quantity: row.quantity,
        boxCount: row.box_count,
        workDate: row.work_date,
        shift: row.shift,
        remark: row.remark,
        performedAt: row.performed_at,
        performedBy: row.full_name ?? row.username ?? null,
      });
      byLine.set(String(row.line_id), list);
    }
    return byLine;
  }

  private async outputView(manager: EntityManager, outputId: string) {
    const map = await this.loadOutputs(manager, 'o.id = $1', [outputId]);
    return [...map.values()][0][0];
  }

  /** Step-change events (with performer name) grouped by packet id. */
  private async loadTimeline(
    manager: EntityManager,
    where: string,
    params: unknown[],
  ): Promise<Map<string, PacketTimelineEvent[]>> {
    const rows = (await manager.query(
      `SELECT e.production_order_packet_id AS packet_id,
              e.from_step_index, e.to_step_index, e.performed_at,
              NULLIF(TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), '') AS full_name,
              u.username
       FROM inventory.production_order_packet_events e
       LEFT JOIN iam.users u ON u.id = e.performed_by
       WHERE ${where}
       ORDER BY e.performed_at, e.id`,
      params,
    )) as unknown as Array<{
      packet_id: string;
      from_step_index: number | null;
      to_step_index: number;
      performed_at: Date;
      full_name: string | null;
      username: string | null;
    }>;
    const byPacket = new Map<string, PacketTimelineEvent[]>();
    for (const row of rows) {
      const list = byPacket.get(String(row.packet_id)) ?? [];
      list.push({
        fromStepIndex: row.from_step_index,
        toStepIndex: row.to_step_index,
        performedAt: row.performed_at,
        performedBy: row.full_name ?? row.username ?? null,
      });
      byPacket.set(String(row.packet_id), list);
    }
    return byPacket;
  }

  // ------------------------------------------------------------------- read

  async findAll(query: ListProductionOrdersQueryDto) {
    const qb = this.dataSource
      .getRepository(ProductionOrder)
      .createQueryBuilder('o')
      .leftJoinAndSelect('o.productionPlan', 'plan')
      .leftJoinAndSelect('o.lines', 'line')
      .leftJoinAndSelect('line.product', 'product')
      .leftJoinAndSelect('line.packets', 'packet')
      .orderBy('o.id', 'DESC');

    if (query.search?.trim()) {
      qb.andWhere(
        `(o.code ILIKE :q OR plan.code ILIKE :q OR product.code ILIKE :q)`,
        { q: `%${query.search.trim()}%` },
      );
    }
    const statuses = (query.status ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((s): s is (typeof PRODUCTION_ORDER_STATUSES)[number] =>
        (PRODUCTION_ORDER_STATUSES as readonly string[]).includes(s),
      );
    if (statuses.length)
      qb.andWhere('o.status IN (:...statuses)', { statuses });
    const planIds = (query.planIds ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => /^\d+$/.test(s));
    if (planIds.length) {
      qb.andWhere('o.productionPlanId IN (:...planIds)', { planIds });
    }

    const [rows, total] = await qb
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();

    return {
      items: rows.map((order) => this.toSummary(order)),
      meta: {
        page: query.page,
        limit: query.limit,
        totalItems: total,
        totalPages: Math.max(1, Math.ceil(total / query.limit)),
      },
    };
  }

  async findOne(id: string) {
    const order = await this.dataSource.getRepository(ProductionOrder).findOne({
      where: { id },
      relations: [
        'productionPlan',
        'lines',
        'lines.product',
        'lines.packets',
        'lines.workflow',
        'lines.workflow.steps',
        'lines.workflow.steps.processStep',
      ],
    });
    if (!order) throw new NotFoundException(`ไม่พบใบสั่งผลิต id ${id}`);

    // One query for every packet's step history (timeline).
    const eventsByPacket = await this.loadTimeline(
      this.dataSource.manager,
      `e.production_order_packet_id IN (
         SELECT p.id FROM inventory.production_order_packets p
         JOIN inventory.production_order_lines l ON l.id = p.production_order_line_id
         WHERE l.production_order_id = $1)`,
      [order.id],
    );
    const outputsByLine = await this.loadOutputs(
      this.dataSource.manager,
      `o.production_order_line_id IN (
         SELECT l.id FROM inventory.production_order_lines l
         WHERE l.production_order_id = $1)`,
      [order.id],
    );

    const lines = await Promise.all(
      [...order.lines]
        .sort((a, b) => a.lineNo - b.lineNo)
        .map(async (line) => {
          const steps: StepView[] = [...line.workflow.steps]
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((step, index) => ({
              index,
              code: step.processStep.code,
              name: step.processStep.nameTh,
            }));
          const packets = await Promise.all(
            [...line.packets]
              .sort((a, b) => a.packetNo - b.packetNo)
              .map((packet) =>
                this.toPacketView(
                  packet,
                  steps,
                  eventsByPacket.get(String(packet.id)) ?? [],
                ),
              ),
          );
          const produced = line.packets.reduce((sum, p) => sum + p.quantity, 0);
          return {
            id: line.id,
            lineNo: line.lineNo,
            product: {
              id: line.product.id,
              code: line.product.code,
              name: line.product.name,
            },
            quantity: line.quantity,
            packingQuantity: line.packingQuantity,
            producedQuantity: produced,
            shortClosedQuantity: line.shortClosedQuantity,
            shortCloseReason: line.shortCloseReason,
            shortClosedAt: line.shortClosedAt,
            remainingQuantity: Math.max(
              0,
              line.quantity - produced - line.shortClosedQuantity,
            ),
            steps,
            outputs: outputsByLine.get(String(line.id)) ?? [],
            packets,
          };
        }),
    );

    return {
      ...this.toSummary(order),
      lines,
    };
  }

  private toSummary(order: ProductionOrder) {
    const lines = [...(order.lines ?? [])].sort((a, b) => a.lineNo - b.lineNo);
    const packets = lines.flatMap((l) => l.packets ?? []);
    return {
      id: order.id,
      code: order.code,
      productionPlanId: order.productionPlanId,
      planCode: order.productionPlan?.code ?? null,
      status: order.status,
      createdAt: order.createdAt,
      completedAt: order.completedAt,
      packetCount: packets.length,
      completedPacketCount: packets.filter((p) => p.status === 'COMPLETED')
        .length,
      lines: lines.map((line) => ({
        id: line.id,
        lineNo: line.lineNo,
        product: line.product
          ? {
              id: line.product.id,
              code: line.product.code,
              name: line.product.name,
            }
          : null,
        quantity: line.quantity,
        packingQuantity: line.packingQuantity,
        packetCount: line.packets?.length ?? 0,
        completedPacketCount:
          line.packets?.filter((p) => p.status === 'COMPLETED').length ?? 0,
        producedQuantity: (line.packets ?? []).reduce(
          (sum, p) => sum + p.quantity,
          0,
        ),
        shortClosedQuantity: line.shortClosedQuantity,
      })),
    };
  }

  private async allocateCode(
    manager: EntityManager,
    date: Date,
  ): Promise<string> {
    const datePart = date.toISOString().slice(0, 10).replaceAll('-', '');
    const prefix = `PO-${datePart}-`;
    await manager.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [prefix]);
    const rows = (await manager.query(
      `SELECT COALESCE(MAX(RIGHT(code, 4)::integer), 0) AS last_number
       FROM inventory.production_orders
       WHERE code LIKE $1`,
      [`${prefix}%`],
    )) as unknown as Array<{ last_number: number | string }>;
    const next = Number(rows[0]?.last_number ?? 0) + 1;
    return `${prefix}${String(next).padStart(4, '0')}`;
  }
}
