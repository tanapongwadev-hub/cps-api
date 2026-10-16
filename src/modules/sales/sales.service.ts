import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { getBangkokDate } from '../../common/business-date';
import { postProductStockMovement } from '../../common/product-stock-ledger';
import { recordAuditEvent } from '../../common/stock-ledger';
import {
  CancelSalesOrderDto,
  CreateSalesOrderDto,
  IssueSalesJobOrderDto,
  ListSalesJobOrdersQueryDto,
  ListSalesOrdersQueryDto,
  PickSalesJobOrderDto,
  SalesJobOrderStatus,
  SalesOrderStatus,
  SalesReportQueryDto,
  UpdateSalesOrderDto,
} from './dto/sales.dto';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Outstanding (reserved − issued) per package across every active reservation. */
const ACTIVE_RESERVED = `
  SELECT package_id, SUM(reserved_qty - issued_qty)::int AS qty
  FROM inventory.sales_job_order_reservations
  WHERE released_at IS NULL
  GROUP BY package_id`;

const ID_PATTERN = /^[1-9]\d*$/;

@Injectable()
export class SalesService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  // ================================================================ lookups

  async lookups() {
    const customers = (await this.dataSource.query(
      `SELECT id, code, name_th AS "nameTh" FROM master.customers
       WHERE is_active = true ORDER BY code`,
    )) as Row[];
    const products = (await this.dataSource.query(
      `WITH reserved AS (${ACTIVE_RESERVED}),
       stock AS (
         SELECT p.product_id,
                SUM(p.current_qty)::int AS packed,
                SUM(p.current_qty - COALESCE(r.qty, 0))::int AS available,
                COUNT(*)::int AS boxes
         FROM inventory.production_packages p
         LEFT JOIN reserved r ON r.package_id = p.id
         WHERE p.product_id IS NOT NULL AND p.status = 'PACKED' AND p.current_qty > 0
         GROUP BY p.product_id)
       SELECT pr.id, pr.code, pr.name, pr.customer_id AS "customerId",
              COALESCE(u.symbol, u.name_th) AS "unitName",
              COALESCE(s.packed, 0) AS "packedQty",
              COALESCE(s.available, 0) AS "availableQty",
              COALESCE(s.boxes, 0) AS "boxCount"
       FROM master.products pr
       LEFT JOIN master.units u ON u.id = pr.unit_id
       LEFT JOIN stock s ON s.product_id = pr.id
       WHERE pr.is_active = true
       ORDER BY pr.code`,
    )) as Row[];
    return { customers, products };
  }

  // ============================================================ sales orders

  async listOrders(query: ListSalesOrdersQueryDto) {
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (sql: string, value: unknown) => {
      params.push(value);
      where.push(sql.replace('?', `$${params.length}`));
    };
    if (query.status) add('o.status = ?', query.status);
    if (query.customerId) add('o.customer_id = ?', query.customerId);
    if (query.dateFrom) add('o.order_date >= ?', query.dateFrom);
    if (query.dateTo) add('o.order_date <= ?', query.dateTo);
    if (query.search?.trim()) {
      params.push(`%${query.search.trim()}%`);
      const n = `$${params.length}`;
      where.push(`(o.code ILIKE ${n} OR o.customer_po ILIKE ${n} OR c.code ILIKE ${n} OR c.name_th ILIKE ${n}
        OR EXISTS (SELECT 1 FROM inventory.sales_order_lines l JOIN master.products p ON p.id = l.product_id
                   WHERE l.sales_order_id = o.id AND (p.code ILIKE ${n} OR p.name ILIKE ${n})))`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const from = `FROM inventory.sales_orders o JOIN master.customers c ON c.id = o.customer_id ${whereSql}`;
    const total = Number(
      ((await this.dataSource.query(`SELECT COUNT(*)::int AS n ${from}`, params)) as Row[])[0].n,
    );
    const offset = (query.page - 1) * query.limit;
    const items = (await this.dataSource.query(
      `SELECT o.id, o.code, o.status, o.version, o.customer_po AS "customerPo",
              to_char(o.order_date, 'YYYY-MM-DD') AS "orderDate",
              to_char(o.due_date, 'YYYY-MM-DD') AS "dueDate",
              o.created_at AS "createdAt",
              json_build_object('id', c.id, 'code', c.code, 'nameTh', c.name_th) AS customer,
              (SELECT COUNT(*)::int FROM inventory.sales_order_lines l WHERE l.sales_order_id = o.id) AS "lineCount",
              (SELECT COALESCE(SUM(quantity), 0)::int FROM inventory.sales_order_lines l WHERE l.sales_order_id = o.id) AS "totalQuantity",
              (SELECT COALESCE(SUM(shipped_quantity), 0)::int FROM inventory.sales_order_lines l WHERE l.sales_order_id = o.id) AS "shippedQuantity",
              (SELECT json_build_object('id', j.id, 'code', j.code, 'status', j.status)
               FROM inventory.sales_job_orders j WHERE j.sales_order_id = o.id) AS "jobOrder"
       ${from}
       ORDER BY o.order_date DESC, o.id DESC
       LIMIT ${query.limit} OFFSET ${offset}`,
      params,
    )) as Row[];
    return {
      items,
      meta: {
        page: query.page,
        limit: query.limit,
        totalItems: total,
        totalPages: Math.max(1, Math.ceil(total / query.limit)),
      },
    };
  }

  async findOrder(id: string, manager: EntityManager = this.dataSource.manager): Promise<Row> {
    this.assertId(id);
    const rows = (await manager.query(
      `SELECT o.id, o.code, o.status, o.version, o.customer_po AS "customerPo", o.remark,
              to_char(o.order_date, 'YYYY-MM-DD') AS "orderDate",
              to_char(o.due_date, 'YYYY-MM-DD') AS "dueDate",
              o.confirmed_at AS "confirmedAt", o.cancelled_at AS "cancelledAt",
              o.cancel_reason AS "cancelReason", o.created_at AS "createdAt", o.updated_at AS "updatedAt",
              json_build_object('id', c.id, 'code', c.code, 'nameTh', c.name_th) AS customer,
              (SELECT json_build_object('id', j.id, 'code', j.code, 'status', j.status)
               FROM inventory.sales_job_orders j WHERE j.sales_order_id = o.id) AS "jobOrder"
       FROM inventory.sales_orders o JOIN master.customers c ON c.id = o.customer_id
       WHERE o.id = $1`,
      [id],
    )) as Row[];
    if (!rows.length) throw new NotFoundException('ไม่พบออเดอร์ขาย');
    const lines = (await manager.query(
      `SELECT l.id, l.line_no AS "lineNo", l.product_id AS "productId", l.quantity,
              l.shipped_quantity AS "shippedQuantity", l.remark,
              json_build_object('id', p.id, 'code', p.code, 'name', p.name,
                                'unitName', COALESCE(u.symbol, u.name_th)) AS product
       FROM inventory.sales_order_lines l
       JOIN master.products p ON p.id = l.product_id
       LEFT JOIN master.units u ON u.id = p.unit_id
       WHERE l.sales_order_id = $1 ORDER BY l.line_no`,
      [id],
    )) as Row[];
    return {
      ...rows[0],
      lines,
      totalQuantity: lines.reduce((sum, l) => sum + Number(l.quantity), 0),
      shippedQuantity: lines.reduce((sum, l) => sum + Number(l.shippedQuantity), 0),
    };
  }

  async createOrder(dto: CreateSalesOrderDto, userId: string) {
    return this.dataSource.transaction(async (m) => {
      await this.validateOrderInput(m, dto);
      const code = await this.allocateCode(m, 'SO', 'sales_orders', 'code');
      const [order] = (await m.query(
        `INSERT INTO inventory.sales_orders
           (code, customer_id, order_date, due_date, customer_po, remark, status, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, 'DRAFT', $7, $7) RETURNING id`,
        [code, dto.customerId, dto.orderDate, dto.dueDate ?? null, dto.customerPo ?? null, dto.remark ?? null, userId],
      )) as Row[];
      await this.insertLines(m, order.id, dto);
      await recordAuditEvent(m, {
        traceId: code,
        action: 'CREATE',
        eventName: 'sales_order.created',
        targetType: 'SALES_ORDER',
        targetId: order.id,
        performedBy: userId,
        after: { code, customerId: dto.customerId, lines: dto.lines },
      });
      return this.findOrder(order.id, m);
    });
  }

  async updateOrder(id: string, dto: UpdateSalesOrderDto, userId: string) {
    return this.dataSource.transaction(async (m) => {
      const order = await this.lockOrder(m, id);
      this.assertVersion(order, dto.version);
      if (order.status !== 'DRAFT') {
        throw new ConflictException('แก้ไขได้เฉพาะออเดอร์สถานะร่าง');
      }
      await this.validateOrderInput(m, dto);
      await m.query(
        `UPDATE inventory.sales_orders
         SET customer_id = $2, order_date = $3, due_date = $4, customer_po = $5, remark = $6,
             updated_by = $7, updated_at = now(), version = version + 1
         WHERE id = $1`,
        [id, dto.customerId, dto.orderDate, dto.dueDate ?? null, dto.customerPo ?? null, dto.remark ?? null, userId],
      );
      await m.query(`DELETE FROM inventory.sales_order_lines WHERE sales_order_id = $1`, [id]);
      await this.insertLines(m, id, dto);
      await recordAuditEvent(m, {
        traceId: order.code,
        action: 'UPDATE',
        eventName: 'sales_order.updated',
        targetType: 'SALES_ORDER',
        targetId: id,
        performedBy: userId,
        after: { customerId: dto.customerId, lines: dto.lines },
      });
      return this.findOrder(id, m);
    });
  }

  async deleteOrder(id: string, version: number, userId: string) {
    return this.dataSource.transaction(async (m) => {
      const order = await this.lockOrder(m, id);
      this.assertVersion(order, version);
      if (order.status !== 'DRAFT') {
        throw new ConflictException('ลบได้เฉพาะออเดอร์สถานะร่าง');
      }
      await m.query(`DELETE FROM inventory.sales_orders WHERE id = $1`, [id]);
      await recordAuditEvent(m, {
        traceId: order.code,
        action: 'DELETE',
        eventName: 'sales_order.deleted',
        targetType: 'SALES_ORDER',
        targetId: id,
        performedBy: userId,
        before: { code: order.code },
      });
      return { id, deleted: true };
    });
  }

  /**
   * Confirms a DRAFT order and creates its sales job order in the same
   * transaction, reserving packed FG boxes FIFO (oldest box first). All or
   * nothing: any shortfall rolls everything back and returns `shortfalls`.
   */
  async confirmOrder(id: string, version: number, userId: string) {
    return this.dataSource.transaction(async (m) => {
      const order = await this.lockOrder(m, id);
      this.assertVersion(order, version);
      if (order.status !== 'DRAFT') {
        throw new ConflictException('ยืนยันได้เฉพาะออเดอร์สถานะร่าง');
      }
      const lines = (await m.query(
        `SELECT l.id, l.product_id, l.quantity, p.code, p.name, p.is_active
         FROM inventory.sales_order_lines l JOIN master.products p ON p.id = l.product_id
         WHERE l.sales_order_id = $1 ORDER BY l.product_id::bigint`,
        [id],
      )) as Row[];
      if (!lines.length) throw new ConflictException('ออเดอร์ต้องมีอย่างน้อย 1 รายการ');

      const plan: Array<{ lineId: string; packageId: string; qty: number }> = [];
      const shortfalls: Row[] = [];
      for (const line of lines) {
        // Lock in id order (deadlock-safe with issue), allocate oldest first.
        const boxes = (await m.query(
          `SELECT id, current_qty, created_at FROM inventory.production_packages
           WHERE product_id = $1 AND status = 'PACKED' AND current_qty > 0
           ORDER BY id FOR UPDATE`,
          [line.product_id],
        )) as Row[];
        const reserved = new Map<string, number>(
          ((await m.query(
            `SELECT package_id, SUM(reserved_qty - issued_qty)::int AS qty
             FROM inventory.sales_job_order_reservations
             WHERE released_at IS NULL AND package_id = ANY($1::bigint[]) GROUP BY package_id`,
            [boxes.map((b) => b.id)],
          )) as Row[]).map((r) => [String(r.package_id), Number(r.qty)]),
        );
        boxes.sort(
          (a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime() ||
            Number(a.id) - Number(b.id),
        );
        let need = Number(line.quantity);
        let available = 0;
        for (const box of boxes) {
          const free = Number(box.current_qty) - (reserved.get(String(box.id)) ?? 0);
          if (free <= 0) continue;
          available += free;
          if (need <= 0) continue;
          const take = Math.min(free, need);
          plan.push({ lineId: line.id, packageId: box.id, qty: take });
          need -= take;
        }
        if (need > 0) {
          shortfalls.push({
            productId: line.product_id,
            productCode: line.code,
            productName: line.name,
            required: Number(line.quantity),
            available,
            shortfall: need,
          });
        }
      }
      if (shortfalls.length) {
        throw new ConflictException({
          message: 'สินค้าสำเร็จรูป (กล่อง FG) ไม่พอสำหรับยืนยันออเดอร์',
          shortfalls,
        });
      }

      const jobCode = await this.allocateCode(m, 'SJ', 'sales_job_orders', 'code');
      const [job] = (await m.query(
        `INSERT INTO inventory.sales_job_orders (code, sales_order_id, status, created_by)
         VALUES ($1, $2, 'WAITING_PICKING', $3) RETURNING id`,
        [jobCode, id, userId],
      )) as Row[];
      for (const p of plan) {
        await m.query(
          `INSERT INTO inventory.sales_job_order_reservations
             (sales_job_order_id, sales_order_line_id, package_id, reserved_qty)
           VALUES ($1, $2, $3, $4)`,
          [job.id, p.lineId, p.packageId, p.qty],
        );
      }
      await m.query(
        `UPDATE inventory.sales_orders SET status = 'CONFIRMED', confirmed_at = now(),
           confirmed_by = $2, updated_by = $2, updated_at = now(), version = version + 1
         WHERE id = $1`,
        [id, userId],
      );
      await recordAuditEvent(m, {
        traceId: order.code,
        action: 'APPROVE',
        eventName: 'sales_order.confirmed',
        targetType: 'SALES_ORDER',
        targetId: id,
        performedBy: userId,
        after: { jobOrder: jobCode, reservations: plan.length },
      });
      return this.findOrder(id, m);
    });
  }

  /**
   * Cancels an order. Unshipped reservations are released; quantities that
   * were already shipped stay in the shipment ledger and in the report.
   */
  async cancelOrder(id: string, dto: CancelSalesOrderDto, userId: string) {
    return this.dataSource.transaction(async (m) => {
      const order = await this.lockOrder(m, id);
      this.assertVersion(order, dto.version);
      if (order.status === 'CANCELLED' || order.status === 'SHIPPED') {
        throw new ConflictException('ออเดอร์นี้ปิดไปแล้ว ยกเลิกไม่ได้');
      }
      const reason = dto.reason.trim();
      const [job] = (await m.query(
        `SELECT id FROM inventory.sales_job_orders WHERE sales_order_id = $1 FOR UPDATE`,
        [id],
      )) as Row[];
      if (job) {
        await m.query(
          `UPDATE inventory.sales_job_order_reservations
           SET released_at = now(), release_type = 'CANCELLED'
           WHERE sales_job_order_id = $1 AND released_at IS NULL`,
          [job.id],
        );
        await m.query(
          `UPDATE inventory.sales_job_orders SET status = 'CANCELLED', cancelled_at = now(),
             cancelled_by = $2, cancel_reason = $3, updated_at = now(), version = version + 1
           WHERE id = $1`,
          [job.id, userId, reason],
        );
      }
      await m.query(
        `UPDATE inventory.sales_orders SET status = 'CANCELLED', cancelled_at = now(),
           cancelled_by = $2, cancel_reason = $3, updated_by = $2, updated_at = now(), version = version + 1
         WHERE id = $1`,
        [id, userId, reason],
      );
      await recordAuditEvent(m, {
        traceId: order.code,
        action: 'CANCEL',
        eventName: 'sales_order.cancelled',
        targetType: 'SALES_ORDER',
        targetId: id,
        performedBy: userId,
        reason,
        before: { status: order.status },
      });
      return this.findOrder(id, m);
    });
  }

  // ========================================================= sales job orders

  async listJobOrders(query: ListSalesJobOrdersQueryDto) {
    const where: string[] = [];
    const params: unknown[] = [];
    if (query.status) {
      params.push(query.status);
      where.push(`j.status = $${params.length}`);
    }
    if (query.dateFrom) {
      params.push(query.dateFrom);
      where.push(`(j.created_at AT TIME ZONE 'Asia/Bangkok')::date >= $${params.length}`);
    }
    if (query.dateTo) {
      params.push(query.dateTo);
      where.push(`(j.created_at AT TIME ZONE 'Asia/Bangkok')::date <= $${params.length}`);
    }
    if (query.search?.trim()) {
      params.push(`%${query.search.trim()}%`);
      const n = params.length;
      where.push(`(j.code ILIKE $${n} OR o.code ILIKE $${n} OR c.code ILIKE $${n} OR c.name_th ILIKE $${n})`);
    }
    const from = `FROM inventory.sales_job_orders j
      JOIN inventory.sales_orders o ON o.id = j.sales_order_id
      JOIN master.customers c ON c.id = o.customer_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`;
    const total = Number(
      ((await this.dataSource.query(`SELECT COUNT(*)::int AS n ${from}`, params)) as Row[])[0].n,
    );
    const items = (await this.dataSource.query(
      `SELECT j.id, j.code, j.status, j.version, j.print_count AS "printCount", j.created_at AS "createdAt",
              j.completed_at AS "completedAt",
              json_build_object('id', o.id, 'code', o.code, 'status', o.status,
                'dueDate', to_char(o.due_date, 'YYYY-MM-DD')) AS "salesOrder",
              json_build_object('id', c.id, 'code', c.code, 'nameTh', c.name_th) AS customer,
              (SELECT COUNT(*)::int FROM inventory.sales_job_order_reservations r WHERE r.sales_job_order_id = j.id) AS "boxCount",
              (SELECT COUNT(*)::int FROM inventory.sales_job_order_reservations r
                WHERE r.sales_job_order_id = j.id AND r.picked_at IS NOT NULL) AS "pickedCount",
              (SELECT COALESCE(SUM(reserved_qty), 0)::int FROM inventory.sales_job_order_reservations r
                WHERE r.sales_job_order_id = j.id) AS "reservedQty",
              (SELECT COALESCE(SUM(issued_qty), 0)::int FROM inventory.sales_job_order_reservations r
                WHERE r.sales_job_order_id = j.id) AS "issuedQty"
       ${from}
       ORDER BY j.id DESC
       LIMIT ${query.limit} OFFSET ${(query.page - 1) * query.limit}`,
      params,
    )) as Row[];
    return {
      items,
      meta: {
        page: query.page,
        limit: query.limit,
        totalItems: total,
        totalPages: Math.max(1, Math.ceil(total / query.limit)),
      },
    };
  }

  async findJobOrder(id: string, manager: EntityManager = this.dataSource.manager) {
    this.assertId(id);
    const rows = (await manager.query(
      `SELECT j.id, j.code, j.status, j.version, j.print_count AS "printCount", j.printed_at AS "printedAt",
              j.completed_at AS "completedAt", j.cancelled_at AS "cancelledAt", j.cancel_reason AS "cancelReason",
              j.created_at AS "createdAt", j.sales_order_id AS "salesOrderId",
              trim(concat(u.first_name, ' ', u.last_name)) AS "createdByName"
       FROM inventory.sales_job_orders j LEFT JOIN iam.users u ON u.id = j.created_by
       WHERE j.id = $1`,
      [id],
    )) as Row[];
    if (!rows.length) throw new NotFoundException('ไม่พบใบจัดงานขาย');
    const job = rows[0];
    const salesOrder = await this.findOrder(job.salesOrderId, manager);
    const pickLines = (await manager.query(
      `SELECT r.id, r.sales_order_line_id AS "salesOrderLineId", r.reserved_qty AS "reservedQty",
              r.issued_qty AS "issuedQty", (r.reserved_qty - r.issued_qty) AS "outstandingQty",
              r.picked_at AS "pickedAt", r.released_at AS "releasedAt", r.release_type AS "releaseType",
              trim(concat(pu.first_name, ' ', pu.last_name)) AS "pickedByName",
              json_build_object('id', p.id, 'qrCode', p.qr_code, 'boxNo', p.box_no, 'currentQty', p.current_qty,
                'initialQty', p.initial_qty, 'status', p.status, 'lotNo', lot.lot_no,
                'productionDate', to_char(lot.production_date, 'YYYY-MM-DD')) AS package,
              json_build_object('id', pr.id, 'code', pr.code, 'name', pr.name,
                'unitName', COALESCE(un.symbol, un.name_th)) AS product
       FROM inventory.sales_job_order_reservations r
       JOIN inventory.production_packages p ON p.id = r.package_id
       JOIN inventory.production_lots lot ON lot.id = p.fg_lot_id
       JOIN master.products pr ON pr.id = p.product_id
       LEFT JOIN master.units un ON un.id = pr.unit_id
       LEFT JOIN iam.users pu ON pu.id = r.picked_by
       WHERE r.sales_job_order_id = $1
       ORDER BY pr.code, p.created_at, p.id`,
      [id],
    )) as Row[];
    const shipments = (await manager.query(
      `SELECT s.issue_no AS "issueNo", to_char(s.issue_date, 'YYYY-MM-DD') AS "issueDate",
              MIN(s.issued_at) AS "issuedAt", SUM(s.qty)::int AS qty, COUNT(*)::int AS "boxCount",
              trim(concat(u.first_name, ' ', u.last_name)) AS "issuedByName"
       FROM inventory.sales_shipments s LEFT JOIN iam.users u ON u.id = s.issued_by
       WHERE s.sales_job_order_id = $1
       GROUP BY s.issue_no, s.issue_date, u.first_name, u.last_name
       ORDER BY MIN(s.issued_at) DESC`,
      [id],
    )) as Row[];
    return { ...job, salesOrder, customer: salesOrder.customer, pickLines, shipments };
  }

  async printJobOrder(id: string, userId: string) {
    return this.dataSource.transaction(async (m) => {
      const job = await this.lockJob(m, id);
      await m.query(
        `UPDATE inventory.sales_job_orders SET print_count = print_count + 1, printed_at = now(),
           printed_by = $2, updated_at = now() WHERE id = $1`,
        [id, userId],
      );
      await recordAuditEvent(m, {
        traceId: job.code,
        action: 'PRINT',
        eventName: 'sales_job_order.printed',
        targetType: 'SALES_JOB_ORDER',
        targetId: id,
        performedBy: userId,
      });
      return this.findJobOrder(id, m);
    });
  }

  /** Scan-to-pick: the scanned box QR must be one reserved for this job. */
  async pick(id: string, dto: PickSalesJobOrderDto, userId: string) {
    return this.dataSource.transaction(async (m) => {
      const job = await this.lockJob(m, id);
      this.assertVersion(job, dto.version);
      if (!['WAITING_PICKING', 'READY_TO_ISSUE', 'PARTIALLY_ISSUED'].includes(job.status)) {
        throw new ConflictException('ใบจัดงานนี้ปิดแล้ว หยิบสินค้าไม่ได้');
      }
      const code = dto.qrCode.trim();
      const matches = (await m.query(
        `SELECT r.id, r.picked_at FROM inventory.sales_job_order_reservations r
         JOIN inventory.production_packages p ON p.id = r.package_id
         WHERE r.sales_job_order_id = $1 AND r.released_at IS NULL AND upper(p.qr_code) = upper($2)
         FOR UPDATE OF r`,
        [id, code],
      )) as Row[];
      if (!matches.length) {
        throw new BadRequestException(`กล่อง ${code} ไม่ได้อยู่ในใบจัดงานนี้`);
      }
      if (matches.every((r) => r.picked_at)) {
        throw new ConflictException(`กล่อง ${code} หยิบแล้ว`);
      }
      await m.query(
        `UPDATE inventory.sales_job_order_reservations SET picked_at = now(), picked_by = $2
         WHERE id = ANY($1::bigint[]) AND picked_at IS NULL`,
        [matches.map((r) => r.id), userId],
      );
      const [{ unpicked }] = (await m.query(
        `SELECT COUNT(*)::int AS unpicked FROM inventory.sales_job_order_reservations
         WHERE sales_job_order_id = $1 AND released_at IS NULL AND picked_at IS NULL`,
        [id],
      )) as Row[];
      const nextStatus = job.status === 'WAITING_PICKING' && unpicked === 0 ? 'READY_TO_ISSUE' : job.status;
      await m.query(
        `UPDATE inventory.sales_job_orders SET status = $2, version = version + 1, updated_at = now()
         WHERE id = $1`,
        [id, nextStatus],
      );
      await recordAuditEvent(m, {
        traceId: job.code,
        action: 'PICK',
        eventName: 'sales_job_order.picked',
        targetType: 'SALES_JOB_ORDER',
        targetId: id,
        performedBy: userId,
        after: { qrCode: code },
      });
      return this.findJobOrder(id, m);
    });
  }

  /**
   * Cuts sales stock: consumes exactly the reserved, picked boxes named in
   * the request (never re-runs FIFO), writes the shipment ledger under one
   * delivery number and posts finished-product stock issues. Idempotent on
   * `requestId`.
   */
  async issue(id: string, dto: IssueSalesJobOrderDto, userId: string) {
    return this.dataSource.transaction(async (m) => {
      const job = await this.lockJob(m, id);
      const replay = (await m.query(
        `SELECT 1 FROM inventory.sales_shipments WHERE request_id = $1 AND sales_job_order_id = $2 LIMIT 1`,
        [dto.requestId, id],
      )) as Row[];
      if (replay.length) return this.findJobOrder(id, m);
      this.assertVersion(job, dto.version);
      if (!['READY_TO_ISSUE', 'PARTIALLY_ISSUED'].includes(job.status)) {
        throw new ConflictException('ต้องหยิบสินค้าครบทุกกล่องก่อนตัดสต็อกขาย');
      }
      const ids = dto.items.map((i) => i.reservationId);
      if (new Set(ids).size !== ids.length) {
        throw new BadRequestException('มีกล่องซ้ำในรายการตัดสต็อก');
      }
      const reservations = (await m.query(
        `SELECT r.*, l.sales_order_id, p.product_id, o.customer_id
         FROM inventory.sales_job_order_reservations r
         JOIN inventory.sales_order_lines l ON l.id = r.sales_order_line_id
         JOIN inventory.sales_orders o ON o.id = l.sales_order_id
         JOIN inventory.production_packages p ON p.id = r.package_id
         WHERE r.id = ANY($1::bigint[]) AND r.sales_job_order_id = $2
         FOR UPDATE OF r`,
        [ids, id],
      )) as Row[];
      if (reservations.length !== ids.length) {
        throw new NotFoundException('มีกล่องที่ไม่ได้อยู่ในใบจัดงานนี้');
      }
      const byId = new Map(reservations.map((r) => [String(r.id), r]));
      // Lock boxes in id order (same order as confirm).
      const packages = (await m.query(
        `SELECT id, qr_code, current_qty, status FROM inventory.production_packages
         WHERE id = ANY($1::bigint[]) ORDER BY id FOR UPDATE`,
        [reservations.map((r) => r.package_id)],
      )) as Row[];
      const pkgById = new Map(packages.map((p) => [String(p.id), p]));

      const issueDate = getBangkokDate();
      const issueNo = await this.allocateCode(m, 'DO', 'sales_shipments', 'issue_no');
      const productTotals = new Map<string, number>();
      for (const item of dto.items) {
        const r = byId.get(item.reservationId)!;
        const pkg = pkgById.get(String(r.package_id))!;
        if (r.released_at) throw new ConflictException(`กล่อง ${pkg.qr_code} ปิดรายการไปแล้ว`);
        if (!r.picked_at) throw new ConflictException(`กล่อง ${pkg.qr_code} ยังไม่ได้หยิบ`);
        const outstanding = Number(r.reserved_qty) - Number(r.issued_qty);
        if (item.quantity > outstanding) {
          throw new ConflictException(`กล่อง ${pkg.qr_code} ตัดได้ไม่เกิน ${outstanding}`);
        }
        if (pkg.status !== 'PACKED' || Number(pkg.current_qty) < item.quantity) {
          throw new ConflictException(`กล่อง ${pkg.qr_code} มีจำนวนคงเหลือไม่พอ`);
        }
        pkg.current_qty = Number(pkg.current_qty) - item.quantity;
        await m.query(
          `UPDATE inventory.production_packages SET current_qty = $2,
             status = CASE WHEN $2 = 0 THEN 'SHIPPED' ELSE status END, updated_at = now()
           WHERE id = $1`,
          [pkg.id, pkg.current_qty],
        );
        const issued = Number(r.issued_qty) + item.quantity;
        await m.query(
          `UPDATE inventory.sales_job_order_reservations SET issued_qty = $2,
             released_at = CASE WHEN $2 = reserved_qty THEN now() ELSE NULL END,
             release_type = CASE WHEN $2 = reserved_qty THEN 'ISSUED' ELSE NULL END
           WHERE id = $1`,
          [r.id, issued],
        );
        await m.query(
          `UPDATE inventory.sales_order_lines SET shipped_quantity = shipped_quantity + $2 WHERE id = $1`,
          [r.sales_order_line_id, item.quantity],
        );
        await m.query(
          `INSERT INTO inventory.sales_shipments
             (request_id, issue_no, sales_job_order_id, sales_order_id, sales_order_line_id, reservation_id,
              package_id, product_id, customer_id, qty, issue_date, issued_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [dto.requestId, issueNo, id, r.sales_order_id, r.sales_order_line_id, r.id, r.package_id,
            r.product_id, r.customer_id, item.quantity, issueDate, userId],
        );
        productTotals.set(String(r.product_id), (productTotals.get(String(r.product_id)) ?? 0) + item.quantity);
      }
      for (const productId of [...productTotals.keys()].sort((a, b) => Number(a) - Number(b))) {
        await postProductStockMovement(m, {
          productId,
          type: 'issue',
          quantity: productTotals.get(productId)!,
          referenceNo: issueNo,
          remark: `ตัดสต็อกขาย ${job.code}`,
          userId,
        });
      }

      const [{ active }] = (await m.query(
        `SELECT COUNT(*)::int AS active FROM inventory.sales_job_order_reservations
         WHERE sales_job_order_id = $1 AND released_at IS NULL`,
        [id],
      )) as Row[];
      const jobStatus: SalesJobOrderStatus = active === 0 ? 'ISSUED' : 'PARTIALLY_ISSUED';
      await m.query(
        `UPDATE inventory.sales_job_orders SET status = $2, version = version + 1, updated_at = now(),
           completed_at = CASE WHEN $3 THEN now() ELSE NULL END
         WHERE id = $1`,
        [id, jobStatus, jobStatus === 'ISSUED'],
      );
      const [{ open }] = (await m.query(
        `SELECT COUNT(*)::int AS open FROM inventory.sales_order_lines
         WHERE sales_order_id = $1 AND shipped_quantity < quantity`,
        [job.sales_order_id],
      )) as Row[];
      const orderStatus: SalesOrderStatus = open === 0 ? 'SHIPPED' : 'PARTIALLY_SHIPPED';
      await m.query(
        `UPDATE inventory.sales_orders SET status = $2, updated_by = $3, updated_at = now(), version = version + 1
         WHERE id = $1`,
        [job.sales_order_id, orderStatus, userId],
      );
      await recordAuditEvent(m, {
        traceId: job.code,
        action: 'ISSUE',
        eventName: 'sales_job_order.issued',
        targetType: 'SALES_JOB_ORDER',
        targetId: id,
        performedBy: userId,
        requestId: dto.requestId,
        after: {
          issueNo,
          boxes: dto.items.length,
          qty: dto.items.reduce((s, i) => s + i.quantity, 0),
        },
      });
      return this.findJobOrder(id, m);
    });
  }

  // ================================================================== report

  async report(query: SalesReportQueryDto) {
    const ship: string[] = [];
    const order: string[] = [`o.status <> 'DRAFT'`];
    const params: unknown[] = [];
    const bind = (value: unknown) => {
      params.push(value);
      return `$${params.length}`;
    };
    if (query.dateFrom) {
      const p = bind(query.dateFrom);
      ship.push(`s.issue_date >= ${p}`);
      order.push(`o.order_date >= ${p}`);
    }
    if (query.dateTo) {
      const p = bind(query.dateTo);
      ship.push(`s.issue_date <= ${p}`);
      order.push(`o.order_date <= ${p}`);
    }
    if (query.customerId) {
      const p = bind(query.customerId);
      ship.push(`s.customer_id = ${p}`);
      order.push(`o.customer_id = ${p}`);
    }
    if (query.productId) {
      const p = bind(query.productId);
      ship.push(`s.product_id = ${p}`);
      order.push(`l.product_id = ${p}`);
    }
    if (query.search?.trim()) {
      const p = bind(`%${query.search.trim()}%`);
      ship.push(`(s.issue_no ILIKE ${p} OR so.code ILIKE ${p} OR pk.qr_code ILIKE ${p})`);
      order.push(`o.code ILIKE ${p}`);
    }
    const shipWhere = ship.length ? `WHERE ${ship.join(' AND ')}` : '';
    const shipFrom = `FROM inventory.sales_shipments s
      JOIN inventory.sales_orders so ON so.id = s.sales_order_id
      JOIN inventory.production_packages pk ON pk.id = s.package_id
      ${shipWhere}`;
    const orderFrom = `FROM inventory.sales_order_lines l
      JOIN inventory.sales_orders o ON o.id = l.sales_order_id
      WHERE ${order.join(' AND ')}`;

    const [summary] = (await this.dataSource.query(
      `SELECT
         (SELECT COUNT(DISTINCT o.id)::int ${orderFrom}) AS "orderCount",
         (SELECT COUNT(DISTINCT o.id)::int ${orderFrom} AND o.status = 'CANCELLED') AS "cancelledOrderCount",
         (SELECT COALESCE(SUM(l.quantity), 0)::int ${orderFrom} AND o.status <> 'CANCELLED') AS "orderedQty",
         (SELECT COALESCE(SUM(l.quantity - l.shipped_quantity), 0)::int ${orderFrom}
            AND o.status IN ('CONFIRMED','PARTIALLY_SHIPPED')) AS "outstandingQty",
         (SELECT COALESCE(SUM(s.qty), 0)::int ${shipFrom}) AS "shippedQty",
         (SELECT COUNT(DISTINCT s.issue_no)::int ${shipFrom}) AS "shipmentCount",
         (SELECT COUNT(*)::int ${shipFrom}) AS "boxCount",
         (SELECT COUNT(DISTINCT s.customer_id)::int ${shipFrom}) AS "customerCount"`,
      params,
    )) as Row[];

    const byProduct = (await this.dataSource.query(
      `SELECT p.id, p.code, p.name, COALESCE(u.symbol, u.name_th) AS "unitName",
              SUM(s.qty)::int AS "shippedQty", COUNT(*)::int AS "boxCount",
              COUNT(DISTINCT s.sales_order_id)::int AS "orderCount"
       FROM inventory.sales_shipments s
       JOIN inventory.sales_orders so ON so.id = s.sales_order_id
       JOIN inventory.production_packages pk ON pk.id = s.package_id
       JOIN master.products p ON p.id = s.product_id
       LEFT JOIN master.units u ON u.id = p.unit_id
       ${shipWhere}
       GROUP BY p.id, p.code, p.name, u.symbol, u.name_th ORDER BY "shippedQty" DESC LIMIT 50`,
      params,
    )) as Row[];

    const byCustomer = (await this.dataSource.query(
      `SELECT c.id, c.code, c.name_th AS "nameTh", SUM(s.qty)::int AS "shippedQty",
              COUNT(DISTINCT s.issue_no)::int AS "shipmentCount",
              COUNT(DISTINCT s.sales_order_id)::int AS "orderCount"
       FROM inventory.sales_shipments s
       JOIN inventory.sales_orders so ON so.id = s.sales_order_id
       JOIN inventory.production_packages pk ON pk.id = s.package_id
       JOIN master.customers c ON c.id = s.customer_id
       ${shipWhere}
       GROUP BY c.id, c.code, c.name_th ORDER BY "shippedQty" DESC LIMIT 50`,
      params,
    )) as Row[];

    const byDay = (await this.dataSource.query(
      `SELECT to_char(s.issue_date, 'YYYY-MM-DD') AS date, SUM(s.qty)::int AS "shippedQty",
              COUNT(DISTINCT s.issue_no)::int AS "shipmentCount"
       ${shipFrom}
       GROUP BY s.issue_date ORDER BY s.issue_date`,
      params,
    )) as Row[];

    const orderStatus = (await this.dataSource.query(
      `SELECT o.status, COUNT(DISTINCT o.id)::int AS count ${orderFrom} GROUP BY o.status`,
      params,
    )) as Row[];

    const offset = (query.page - 1) * query.limit;
    const items = (await this.dataSource.query(
      `SELECT s.id, s.issue_no AS "issueNo", to_char(s.issue_date, 'YYYY-MM-DD') AS "issueDate",
              s.issued_at AS "issuedAt", s.qty,
              json_build_object('id', so.id, 'code', so.code, 'customerPo', so.customer_po) AS "salesOrder",
              json_build_object('id', j.id, 'code', j.code) AS "jobOrder",
              json_build_object('id', c.id, 'code', c.code, 'nameTh', c.name_th) AS customer,
              json_build_object('id', p.id, 'code', p.code, 'name', p.name,
                'unitName', COALESCE(u.symbol, u.name_th)) AS product,
              json_build_object('qrCode', pk.qr_code, 'boxNo', pk.box_no, 'lotNo', lot.lot_no) AS package,
              trim(concat(us.first_name, ' ', us.last_name)) AS "issuedByName"
       FROM inventory.sales_shipments s
       JOIN inventory.sales_orders so ON so.id = s.sales_order_id
       JOIN inventory.sales_job_orders j ON j.id = s.sales_job_order_id
       JOIN inventory.production_packages pk ON pk.id = s.package_id
       JOIN inventory.production_lots lot ON lot.id = pk.fg_lot_id
       JOIN master.customers c ON c.id = s.customer_id
       JOIN master.products p ON p.id = s.product_id
       LEFT JOIN master.units u ON u.id = p.unit_id
       LEFT JOIN iam.users us ON us.id = s.issued_by
       ${shipWhere}
       ORDER BY s.issued_at DESC, s.id DESC
       LIMIT ${query.limit} OFFSET ${offset}`,
      params,
    )) as Row[];

    return {
      summary,
      byProduct,
      byCustomer,
      byDay,
      orderStatus,
      items,
      meta: {
        page: query.page,
        limit: query.limit,
        totalItems: summary.boxCount,
        totalPages: Math.max(1, Math.ceil(summary.boxCount / query.limit)),
      },
    };
  }

  // ================================================================= helpers

  private assertId(id: string) {
    if (!ID_PATTERN.test(id)) throw new BadRequestException('รหัสไม่ถูกต้อง');
  }

  private assertVersion(row: Row, version: number) {
    if (Number(row.version) !== Number(version)) {
      throw new ConflictException('ข้อมูลถูกแก้ไขจากที่อื่นแล้ว กรุณารีเฟรชแล้วลองอีกครั้ง');
    }
  }

  private async lockOrder(m: EntityManager, id: string): Promise<Row> {
    this.assertId(id);
    const rows = (await m.query(
      `SELECT * FROM inventory.sales_orders WHERE id = $1 FOR UPDATE`,
      [id],
    )) as Row[];
    if (!rows.length) throw new NotFoundException('ไม่พบออเดอร์ขาย');
    return rows[0];
  }

  private async lockJob(m: EntityManager, id: string): Promise<Row> {
    this.assertId(id);
    const rows = (await m.query(
      `SELECT * FROM inventory.sales_job_orders WHERE id = $1 FOR UPDATE`,
      [id],
    )) as Row[];
    if (!rows.length) throw new NotFoundException('ไม่พบใบจัดงานขาย');
    return rows[0];
  }

  private async validateOrderInput(m: EntityManager, dto: CreateSalesOrderDto) {
    if (dto.dueDate && dto.dueDate < dto.orderDate) {
      throw new BadRequestException('วันส่งมอบต้องไม่ก่อนวันที่สั่ง');
    }
    const customer = (await m.query(
      `SELECT is_active FROM master.customers WHERE id = $1`,
      [dto.customerId],
    )) as Row[];
    if (!customer.length || !customer[0].is_active) {
      throw new BadRequestException('ไม่พบลูกค้าหรือลูกค้าถูกปิดใช้งาน');
    }
    const ids = dto.lines.map((l) => l.productId);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException('สินค้าซ้ำในออเดอร์เดียวกัน — รวมจำนวนไว้ในรายการเดียว');
    }
    const products = (await m.query(
      `SELECT id FROM master.products WHERE id = ANY($1::bigint[]) AND is_active = true`,
      [ids],
    )) as Row[];
    if (products.length !== ids.length) {
      throw new BadRequestException('มีสินค้าที่ไม่พบหรือถูกปิดใช้งาน');
    }
  }

  private async insertLines(m: EntityManager, orderId: string, dto: CreateSalesOrderDto) {
    let lineNo = 0;
    for (const line of dto.lines) {
      lineNo += 1;
      await m.query(
        `INSERT INTO inventory.sales_order_lines (sales_order_id, line_no, product_id, quantity, remark)
         VALUES ($1, $2, $3, $4, $5)`,
        [orderId, lineNo, line.productId, line.quantity, line.remark ?? null],
      );
    }
  }

  /** `PREFIX-YYYYMMDD-NNNN` per Bangkok day, serialized by an advisory lock. */
  private async allocateCode(
    m: EntityManager,
    prefix: 'SO' | 'SJ' | 'DO',
    table: string,
    column: string,
  ): Promise<string> {
    const head = `${prefix}-${getBangkokDate().replaceAll('-', '')}-`;
    await m.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [head]);
    const rows = (await m.query(
      `SELECT COALESCE(MAX(RIGHT(${column}, 4)::int), 0) AS last FROM inventory.${table}
       WHERE ${column} LIKE $1`,
      [`${head}%`],
    )) as Row[];
    return `${head}${String(Number(rows[0].last) + 1).padStart(4, '0')}`;
  }
}
