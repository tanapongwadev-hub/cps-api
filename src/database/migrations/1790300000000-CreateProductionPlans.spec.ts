import type { QueryRunner } from 'typeorm';
import { CreateProductionPlans1790300000000 } from './1790300000000-CreateProductionPlans';

function makeQueryRunner() {
  const calls: string[] = [];
  const queryRunner = {
    query: jest.fn((sql: string) => {
      calls.push(sql);
      return Promise.resolve([]);
    }),
  } as unknown as QueryRunner;
  return { queryRunner, calls };
}

describe('CreateProductionPlans1790300000000', () => {
  it('creates the three Production Plan tables before adding the Disbursement FK', async () => {
    const { queryRunner, calls } = makeQueryRunner();
    await new CreateProductionPlans1790300000000().up(queryRunner);

    const planIndex = calls.findIndex((sql) =>
      sql.includes('CREATE TABLE inventory.production_plans'),
    );
    const lineIndex = calls.findIndex((sql) =>
      sql.includes('CREATE TABLE inventory.production_plan_lines'),
    );
    const reservationIndex = calls.findIndex((sql) =>
      sql.includes('CREATE TABLE inventory.production_plan_reservations'),
    );
    const disbursementFkIndex = calls.findIndex((sql) =>
      sql.includes('fk_materials_disbursements_production_plan'),
    );

    expect(planIndex).toBeGreaterThanOrEqual(0);
    expect(lineIndex).toBeGreaterThan(planIndex);
    expect(reservationIndex).toBeGreaterThan(lineIndex);
    expect(disbursementFkIndex).toBeGreaterThan(reservationIndex);
  });

  it('enforces all five canonical statuses and positive quantities', async () => {
    const { queryRunner, calls } = makeQueryRunner();
    await new CreateProductionPlans1790300000000().up(queryRunner);
    const sql = calls.join('\n');

    for (const status of [
      'DRAFT',
      'APPROVED',
      'ISSUED',
      'CANCELLED',
      'EXPIRED',
    ]) {
      expect(sql).toContain(`'${status}'`);
    }
    expect(sql).toContain('quantity > 0');
    expect(sql).toContain('reserved_quantity > 0');
  });

  it('creates a partial index for active package reservations', async () => {
    const { queryRunner, calls } = makeQueryRunner();
    await new CreateProductionPlans1790300000000().up(queryRunner);
    const activeIndex = calls.find((sql) =>
      sql.includes('idx_production_plan_reservations_active_package'),
    );

    expect(activeIndex).toContain('WHERE released_at IS NULL');
  });
});
