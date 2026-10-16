import { randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { EntityManager } from 'typeorm';

export interface ProductStockPostingInput {
  productId: string;
  type: 'receive' | 'issue';
  quantity: number;
  referenceNo: string;
  remark?: string | null;
  userId: string;
}

/**
 * Posts one automatic finished-product stock movement inside the caller's
 * transaction (FG packing, packing void, sales issue). Locks the product row
 * — the same serialization point as ProductStockService#record — and refuses
 * an issue that would take the balance below zero.
 */
export async function postProductStockMovement(
  manager: EntityManager,
  input: ProductStockPostingInput,
): Promise<void> {
  await manager.query(
    `SELECT id FROM master.products WHERE id = $1 FOR UPDATE`,
    [input.productId],
  );
  const rows = (await manager.query(
    `SELECT (COALESCE(SUM(CASE WHEN type = 'receive' THEN quantity ELSE -quantity END), 0)
              + CAST($2 AS numeric))::text AS next
     FROM inventory.product_stock_movements WHERE product_id = $1`,
    [input.productId, input.type === 'receive' ? input.quantity : -input.quantity],
  )) as Array<{ next: string }>;
  const next = rows[0].next;
  if (next.startsWith('-')) {
    throw new ConflictException(
      'ยอดสต็อกสินค้าสำเร็จรูปไม่พอสำหรับการจ่ายออกนี้ — ตรวจยอดในหน้าสต็อกสินค้า',
    );
  }
  await manager.query(
    `INSERT INTO inventory.product_stock_movements
       (product_id, request_id, type, quantity, balance_after, reference_no, remark, recorded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      input.productId,
      randomUUID(),
      input.type,
      input.quantity.toFixed(4),
      next,
      input.referenceNo.slice(0, 100),
      input.remark ?? null,
      input.userId,
    ],
  );
}
