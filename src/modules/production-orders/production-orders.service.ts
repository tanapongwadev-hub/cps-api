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
import {
  PRODUCTION_ORDER_STATUSES,
  ProductionOrder,
  ProductionOrderLine,
  ProductionOrderPacket,
} from './production-order.entity';

export interface StepView {
  index: number;
  code: string;
  name: string;
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
      let totalPackets = 0;
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
        const lineRepo = manager.getRepository(ProductionOrderLine);
        const line = await lineRepo.save(
          lineRepo.create({
            productionOrderId: order.id,
            lineNo,
            productId: product.id,
            workflowId: workflow.id,
            quantity: planLine.quantity,
            packingQuantity: packing,
          }),
        );

        const packetCount = Math.ceil(planLine.quantity / packing);
        const packetRepo = manager.getRepository(ProductionOrderPacket);
        for (let n = 1; n <= packetCount; n += 1) {
          const quantity =
            n < packetCount ? packing : planLine.quantity - packing * (n - 1);
          await packetRepo.save(
            packetRepo.create({
              productionOrderLineId: line.id,
              packetNo: n,
              qrCode: `${code}-L${lineNo}-${String(n).padStart(3, '0')}`,
              quantity,
              currentStepIndex: 0,
              status: 'IN_PROGRESS',
            }),
          );
          totalPackets += 1;
        }
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
          packets: totalPackets,
        },
      });
      return order.id;
    });
    return this.findOne(orderId);
  }

  // ---------------------------------------------------------------- advance

  async advancePacket(packetId: string, userId: string) {
    const orderId = await this.dataSource.transaction(async (manager) => {
      const packetRepo = manager.getRepository(ProductionOrderPacket);
      const packet = await packetRepo.findOne({
        where: { id: packetId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!packet) {
        throw new NotFoundException(`ไม่พบ packet id ${packetId}`);
      }
      if (packet.status === 'COMPLETED') {
        throw new ConflictException('packet นี้ผ่านทุกขั้นตอนแล้ว');
      }
      const line = await manager
        .getRepository(ProductionOrderLine)
        .findOneOrFail({ where: { id: packet.productionOrderLineId } });
      const stepCount = await manager.getRepository(ProductWorkflow).findOne({
        where: { id: line.workflowId },
        relations: ['steps'],
      });
      const total = stepCount?.steps.length ?? 0;

      const before = packet.currentStepIndex;
      packet.currentStepIndex = before + 1;
      if (packet.currentStepIndex >= total) {
        packet.currentStepIndex = total;
        packet.status = 'COMPLETED';
      }
      packet.stepUpdatedAt = new Date();
      packet.stepUpdatedBy = userId;
      await packetRepo.save(packet);

      const order = await manager
        .getRepository(ProductionOrder)
        .findOneOrFail({ where: { id: line.productionOrderId } });
      const open = (await manager.query(
        `SELECT COUNT(*)::int AS open_count
         FROM inventory.production_order_packets p
         JOIN inventory.production_order_lines l ON l.id = p.production_order_line_id
         WHERE l.production_order_id = $1 AND p.status <> 'COMPLETED'`,
        [order.id],
      )) as unknown as Array<{ open_count: number }>;
      if (open[0].open_count === 0 && order.status !== 'COMPLETED') {
        order.status = 'COMPLETED';
        order.completedAt = new Date();
        await manager.getRepository(ProductionOrder).save(order);
      }

      await recordAuditEvent(manager, {
        traceId: order.code,
        action: 'UPDATE',
        eventName: 'production_order.step_advanced',
        targetType: 'PRODUCTION_ORDER',
        targetId: order.id,
        performedBy: userId,
        before: { qrCode: packet.qrCode, stepIndex: before },
        after: {
          qrCode: packet.qrCode,
          stepIndex: packet.currentStepIndex,
          status: packet.status,
        },
      });
      return order.id;
    });
    return this.findOne(orderId);
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
              .map(async (packet) => ({
                id: packet.id,
                packetNo: packet.packetNo,
                qrCode: packet.qrCode,
                qrImage: await QRCode.toDataURL(packet.qrCode, {
                  margin: 1,
                  width: 240,
                }),
                quantity: packet.quantity,
                status: packet.status,
                currentStepIndex: packet.currentStepIndex,
                currentStep:
                  packet.status === 'COMPLETED'
                    ? null
                    : (steps[packet.currentStepIndex] ?? null),
                stepUpdatedAt: packet.stepUpdatedAt,
              })),
          );
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
            steps,
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
