import type { QueryRunner } from 'typeorm';
import { AddProductionPlanMenuAndPermissions1790300000001 } from './1790300000001-AddProductionPlanMenuAndPermissions';

function makeQueryRunner() {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  const queryRunner = {
    query: jest.fn((sql: string, params?: unknown[]) => {
      calls.push({ sql, params });
      return Promise.resolve([]);
    }),
  } as unknown as QueryRunner;
  return { queryRunner, calls };
}

describe('AddProductionPlanMenuAndPermissions1790300000001', () => {
  it('adds separate APPROVE and ISSUE shared actions', async () => {
    const { queryRunner, calls } = makeQueryRunner();
    await new AddProductionPlanMenuAndPermissions1790300000001().up(
      queryRunner,
    );
    const actionParams = calls
      .filter(({ sql }) => sql.includes('INSERT INTO iam.actions'))
      .map(({ params }) => params?.[0]);
    expect(actionParams).toEqual(['APPROVE', 'ISSUE']);
  });

  it('creates distinct permission codes for every lifecycle action', async () => {
    const { queryRunner, calls } = makeQueryRunner();
    await new AddProductionPlanMenuAndPermissions1790300000001().up(
      queryRunner,
    );
    const permissionCodes = calls
      .filter(({ sql }) => sql.includes('INSERT INTO iam.permissions'))
      .map(({ params }) => params?.[1]);
    expect(permissionCodes).toEqual([
      'PRODUCTION_PLAN_VIEW',
      'PRODUCTION_PLAN_CREATE',
      'PRODUCTION_PLAN_UPDATE',
      'PRODUCTION_PLAN_DELETE',
      'PRODUCTION_PLAN_APPROVE',
      'PRODUCTION_PLAN_ISSUE',
      'PRODUCTION_PLAN_CANCEL',
    ]);
  });

  it('seeds the confirmed frontend route', async () => {
    const { queryRunner, calls } = makeQueryRunner();
    await new AddProductionPlanMenuAndPermissions1790300000001().up(
      queryRunner,
    );
    expect(
      calls.some(
        ({ sql }) =>
          sql.includes("'PRODUCTION_PLANS'") &&
          sql.includes("'/production/plans'"),
      ),
    ).toBe(true);
  });
});
