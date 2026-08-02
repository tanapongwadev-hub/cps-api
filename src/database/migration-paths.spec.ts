import { createRequire } from 'node:module';
import { migrationGlob } from './migration-paths';

describe('migrationGlob', () => {
  it('discovers migrations without loading Jest spec files', () => {
    const typeormRequire = createRequire(require.resolve('typeorm'));
    const glob = typeormRequire('glob') as {
      sync: (pattern: string) => string[];
    };
    const matches = glob.sync(migrationGlob.replace(/\\/g, '/'));

    expect(
      matches.some((file) =>
        file.endsWith('1700000000005-CreateMaterialMaster.ts'),
      ),
    ).toBe(true);
    expect(matches.some((file) => file.endsWith('.spec.ts'))).toBe(false);
  });
});
