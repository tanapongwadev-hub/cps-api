import { ConflictException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { MaterialsDisbursementCounter } from '../entities/inventory/materials-disbursement-counter.entity';

/**
 * Allocates the next `DIS-YYYYMMDD-NNNN` disbursement number for the given
 * date, using the shared per-day counter row (locked `pessimistic_write`).
 *
 * Extracted from the duplicated implementation that used to live in both
 * `materials-disbursement.service.ts` and `production-plans.service.ts`
 * (Production Plan issue and Job Order issue both mint real
 * `MaterialsDisbursement` numbers) — output format is unchanged.
 */
export async function allocateDisbursementNo(
  manager: EntityManager,
  date: string,
): Promise<string> {
  const repo = manager.getRepository(MaterialsDisbursementCounter);
  let counter = await repo.findOne({
    where: { disbursementDate: date },
    lock: { mode: 'pessimistic_write' },
  });
  if (!counter) {
    await manager.query(
      `INSERT INTO inventory.materials_disbursement_counters
         (disbursement_date, last_number)
       VALUES ($1, 0)
       ON CONFLICT (disbursement_date) DO NOTHING`,
      [date],
    );
    counter = await repo.findOne({
      where: { disbursementDate: date },
      lock: { mode: 'pessimistic_write' },
    });
  }
  if (!counter)
    throw new ConflictException('Unable to allocate Disbursement number');
  counter.lastNumber += 1;
  await repo.save(counter);
  return `DIS-${date.replaceAll('-', '')}-${String(counter.lastNumber).padStart(4, '0')}`;
}
