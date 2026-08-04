import { CreateAdditionalMasterTables1700000000007 } from './1700000000007-CreateAdditionalMasterTables';

describe('CreateAdditionalMasterTables1700000000007', () => {
  it('has a stable migration name', () => {
    const migration = new CreateAdditionalMasterTables1700000000007();
    expect(migration.name).toBe('CreateAdditionalMasterTables1700000000007');
  });

  it('exposes up and down methods', () => {
    const migration = new CreateAdditionalMasterTables1700000000007();
    expect(typeof migration.up).toBe('function');
    expect(typeof migration.down).toBe('function');
  });
});
