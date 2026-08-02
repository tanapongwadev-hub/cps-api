import { execFileSync } from 'node:child_process';

describe('AppDataSource loading', () => {
  it('resolves dotenv from the project and loads the standalone data source', () => {
    expect(() =>
      execFileSync(
        process.execPath,
        [
          '-r',
          'ts-node/register',
          '-r',
          'tsconfig-paths/register',
          '-e',
          "require('./src/database/data-source.ts')",
        ],
        {
          cwd: process.cwd(),
          env: { ...process.env, NODE_PATH: '' },
          stdio: 'pipe',
        },
      ),
    ).not.toThrow();
  });
});
