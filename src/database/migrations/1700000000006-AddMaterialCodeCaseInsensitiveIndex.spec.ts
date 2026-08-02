import { AddMaterialCodeCaseInsensitiveIndex1700000000006 } from './1700000000006-AddMaterialCodeCaseInsensitiveIndex';

describe('AddMaterialCodeCaseInsensitiveIndex1700000000006', () => {
  it('adds a unique case-insensitive material code index', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const migration = new AddMaterialCodeCaseInsensitiveIndex1700000000006();

    await migration.up({ query } as never);

    expect(query).toHaveBeenCalledWith(
      'CREATE UNIQUE INDEX uq_materials_code_ci ON master.materials (LOWER(code))',
    );
  });

  it('removes only the case-insensitive material code index on rollback', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const migration = new AddMaterialCodeCaseInsensitiveIndex1700000000006();

    await migration.down({ query } as never);

    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith(
      'DROP INDEX IF EXISTS master.uq_materials_code_ci',
    );
  });
});
