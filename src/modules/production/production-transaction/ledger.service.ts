import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import {
  ProductionTransaction,
  ProductionTransactionOrigin,
} from '../entities/production-transaction.entity';

export type LedgerEntry = Pick<
  ProductionTransaction,
  | 'requestId'
  | 'productionOrderId'
  | 'productionOrderLineId'
  | 'stepIndex'
  | 'processStepId'
  | 'transactionType'
  | 'qty'
  | 'transactionDate'
> &
  Partial<
    Pick<
      ProductionTransaction,
      | 'sourceLotId'
      | 'targetLotId'
      | 'sourceWipId'
      | 'targetWipId'
      | 'packageId'
      | 'rejectReasonId'
      | 'shiftKey'
      | 'allocationMode'
      | 'reversesTransactionId'
      | 'remark'
      | 'operatorId'
      | 'correlationId'
    >
  >;

export interface OriginQty {
  originLotId: string;
  qty: number;
}

/**
 * Writes one ledger movement plus its origin breakdown. Always called inside
 * the caller's transaction, together with the state changes it describes.
 * The ledger is append-only (DB triggers forbid UPDATE/DELETE).
 */
@Injectable()
export class LedgerService {
  async write(
    manager: EntityManager,
    entry: LedgerEntry,
    origins: OriginQty[] = [],
  ): Promise<ProductionTransaction> {
    const repo = manager.getRepository(ProductionTransaction);
    const tx = await repo.save(repo.create(entry));
    const rows = origins.filter((o) => o.qty !== 0);
    if (rows.length) {
      await manager.getRepository(ProductionTransactionOrigin).insert(
        rows.map((o) => ({
          transactionId: tx.id,
          originLotId: o.originLotId,
          qty: o.qty,
        })),
      );
    }
    return tx;
  }
}
