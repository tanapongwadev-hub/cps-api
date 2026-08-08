import type { QueryRunner } from 'typeorm';
import { AddPostCancelActions1700000000009 } from './1700000000009-AddPostCancelActions';

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

describe('AddPostCancelActions1700000000009', () => {
  it('has a stable migration name', () => {
    expect(new AddPostCancelActions1700000000009().name).toBe(
      'AddPostCancelActions1700000000009',
    );
  });

  it('inserts POST and CANCEL idempotently', async () => {
    const { queryRunner, calls } = makeQueryRunner();
    await new AddPostCancelActions1700000000009().up(queryRunner);

    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(call.sql).toContain('INSERT INTO iam.actions');
      expect(call.sql).toContain('ON CONFLICT (code) DO NOTHING');
    }
    expect(calls.map((call) => call.params?.[0])).toEqual(['POST', 'CANCEL']);
  });

  it('marks both actions as system actions', async () => {
    const { queryRunner, calls } = makeQueryRunner();
    await new AddPostCancelActions1700000000009().up(queryRunner);
    for (const call of calls) {
      expect(call.sql).toContain('true, true');
    }
  });

  it('removes only the two actions on rollback', async () => {
    const { queryRunner, calls } = makeQueryRunner();
    await new AddPostCancelActions1700000000009().down(queryRunner);
    expect(calls).toHaveLength(2);
    expect(calls.map((call) => call.params?.[0])).toEqual(['POST', 'CANCEL']);
    for (const call of calls) {
      expect(call.sql).toContain('DELETE FROM iam.actions WHERE code = $1');
    }
  });
});
