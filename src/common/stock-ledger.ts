import { randomUUID } from 'node:crypto';
import { EntityManager } from 'typeorm';
import { StockTransaction } from '../entities/inventory/stock-transaction.entity';
import { AuditLog } from '../entities/iam/audit-log.entity';

export function createTraceId(prefix: 'RCV' | 'ISS' | 'ADJ' = 'ADJ'): string {
  const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  return `TRC-${prefix}-${date}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

function createTransactionNo(): string {
  const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 17);
  return `TXN-${stamp}-${randomUUID().slice(0, 6).toUpperCase()}`;
}

export interface StockMovementInput {
  traceId: string;
  transactionType: StockTransaction['transactionType'];
  materialId: string;
  referenceType: StockTransaction['referenceType'];
  referenceId: string;
  referenceLotNo?: string | null;
  mainQrId?: string | null;
  subQrId?: string | null;
  unitId?: string | null;
  departmentId?: string | null;
  productionOrder?: string | null;
  referenceNo?: string | null;
  sourceLocationId?: string | null;
  destinationLocationId?: string | null;
  quantityBefore: string;
  quantityIn: string;
  quantityOut: string;
  quantityAfter: string;
  reason?: string | null;
  remark?: string | null;
  performedBy: string;
  transactionDate?: Date;
}

/** The only write seam for auditable inventory movements. */
export async function recordStockMovement(
  manager: EntityManager,
  input: StockMovementInput,
): Promise<StockTransaction> {
  const repository = manager.getRepository(StockTransaction);
  return repository.save(
    repository.create({
      transactionNo: createTransactionNo(),
      traceId: input.traceId,
      transactionType: input.transactionType,
      materialId: input.materialId,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      referenceLotNo: input.referenceLotNo ?? null,
      mainQrId: input.mainQrId ?? null,
      subQrId: input.subQrId ?? null,
      unitId: input.unitId ?? null,
      departmentId: input.departmentId ?? null,
      productionOrder: input.productionOrder ?? null,
      referenceNo: input.referenceNo ?? null,
      sourceLocationId: input.sourceLocationId ?? null,
      destinationLocationId: input.destinationLocationId ?? null,
      quantityBefore: input.quantityBefore,
      quantityIn: input.quantityIn,
      quantityOut: input.quantityOut,
      quantityAfter: input.quantityAfter,
      transactionDate: input.transactionDate ?? new Date(),
      reason: input.reason ?? null,
      remark: input.remark ?? null,
      createdBy: input.performedBy,
    }),
  );
}

export interface AuditEventInput {
  traceId: string;
  action:
    | 'CREATE'
    | 'UPDATE'
    | 'DELETE'
    | 'CANCEL'
    | 'APPROVE'
    | 'REOPEN'
    | 'STATUS_CHANGE';
  targetType:
    'MATERIAL_RECEIVING' | 'MATERIALS_DISBURSEMENT' | 'STOCK_MOVEMENT' | 'QR';
  targetId: string;
  performedBy: string;
  departmentId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  requestId?: string | null;
}

/** Writes business audit history through the caller's database transaction. */
export async function recordAuditEvent(
  manager: EntityManager,
  input: AuditEventInput,
): Promise<AuditLog> {
  const repository = manager.getRepository(AuditLog);
  return repository.save(
    repository.create({
      actorUserId: input.performedBy,
      departmentId: input.departmentId ?? null,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      beforeData: input.before ?? null,
      afterData: input.after ?? null,
      ipAddress: null,
      userAgent: null,
      traceId: input.traceId,
      requestId: input.requestId ?? null,
      reason: input.reason ?? null,
    }),
  );
}
