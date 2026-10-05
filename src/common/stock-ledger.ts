import { randomUUID } from 'node:crypto';
import { EntityManager } from 'typeorm';
import { StockTransaction } from '../entities/inventory/stock-transaction.entity';
import { AuditLog } from '../entities/iam/audit-log.entity';

export interface AuditRequestContext {
  correlationId: string;
  requestId: string;
  ipAddress: string | null;
  userAgent: string | null;
}

let auditRequestContext: (() => AuditRequestContext | undefined) | undefined;

/**
 * `recordAuditEvent` is the existing transaction-local write seam. Supplying
 * request context here lets every current caller inherit correlation metadata
 * without changing its business method signature one module at a time.
 */
export function configureAuditRequestContext(
  provider: () => AuditRequestContext | undefined,
): void {
  auditRequestContext = provider;
}

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
  action: string;
  targetType: string;
  targetId?: string | null;
  /** null for a system-initiated event (e.g. the auto-expiry cron). */
  performedBy: string | null;
  departmentId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  requestId?: string | null;
  correlationId?: string | null;
  eventName?: string;
  outcome?: AuditEventOutcome;
}

export type AuditEventOutcome =
  'ATTEMPTED' | 'SUCCESS' | 'FAILURE' | 'DENIED' | 'TIMEOUT';

const TARGET_EVENT_PREFIX: Record<string, string> = {
  MATERIAL_RECEIVING: 'material_receiving',
  MATERIALS_DISBURSEMENT: 'material_disbursement',
  PRODUCTION_PLAN: 'production_plan',
  PRODUCTION_ORDER: 'production_order',
  MATERIAL_JOB_ORDER: 'material_job_order',
  STOCK_MOVEMENT: 'inventory.stock',
  QR: 'inventory.qr',
};

const ACTION_EVENT_SUFFIX: Record<string, string> = {
  CREATE: 'created',
  UPDATE: 'updated',
  DELETE: 'deleted',
  CANCEL: 'cancelled',
  APPROVE: 'approved',
  REOPEN: 'reopened',
  STATUS_CHANGE: 'status_changed',
  RESERVE: 'reservation_created',
  RELEASE: 'reservation_released',
  PRINT: 'printed',
  PICK: 'picked',
  ISSUE: 'issued',
  COMPLETE: 'completed',
};

/** Writes business audit history through the caller's database transaction. */
export async function recordAuditEvent(
  manager: EntityManager,
  input: AuditEventInput,
): Promise<AuditLog> {
  const repository = manager.getRepository(AuditLog);
  const context = auditRequestContext?.();
  const audit = await repository.save(
    repository.create({
      eventId: randomUUID(),
      eventName:
        input.eventName ??
        `${TARGET_EVENT_PREFIX[input.targetType] ?? input.targetType.toLowerCase()}.${ACTION_EVENT_SUFFIX[input.action] ?? input.action.toLowerCase()}`,
      schemaVersion: 1,
      stream: 'audit',
      outcome: input.outcome ?? 'SUCCESS',
      actorUserId: input.performedBy,
      departmentId: input.departmentId ?? null,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      beforeData: input.before ?? null,
      afterData: input.after ?? null,
      ipAddress: context?.ipAddress ?? null,
      userAgent: context?.userAgent ?? null,
      traceId: input.traceId,
      correlationId:
        input.correlationId ?? context?.correlationId ?? input.traceId,
      requestId: input.requestId ?? context?.requestId ?? null,
      reason: input.reason ?? null,
      occurredAt: new Date(),
    }),
  );
  return audit;
}
