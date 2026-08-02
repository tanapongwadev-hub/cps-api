import { CreateMaterialMaster1700000000005 } from './1700000000005-CreateMaterialMaster';

describe('CreateMaterialMaster1700000000005', () => {
  it('creates the approved material master schema', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const migration = new CreateMaterialMaster1700000000005();

    await migration.up({ query } as never);
    const sql = query.mock.calls
      .map(([statement]: [string]) => statement)
      .join('\n');

    expect(sql).toContain('CREATE SCHEMA IF NOT EXISTS master');
    for (const table of [
      'units',
      'delivery_types',
      'material_models',
      'loading_points',
      'suppliers',
      'materials',
      'supplier_materials',
    ]) {
      expect(sql).toContain('CREATE TABLE master.' + table);
    }
    expect(sql).toContain('name VARCHAR(255) NOT NULL');
    expect(sql).not.toContain('CREATE TABLE master.process_lines');
    expect(sql).not.toContain('process_line_id');
    expect(sql).toContain('process_line_name VARCHAR(255)');
    expect(sql).toContain('scale VARCHAR(255)');
    expect(sql).toContain('image_path VARCHAR(500)');
    expect(sql).toContain('UNIQUE (material_id, supplier_id)');
    expect(sql).toContain(
      'FOREIGN KEY (unit_id) REFERENCES master.units(id) ON DELETE RESTRICT',
    );
  });

  it('drops owned tables in dependency-safe order', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const migration = new CreateMaterialMaster1700000000005();

    await migration.down({ query } as never);
    const sql = query.mock.calls
      .map(([statement]: [string]) => statement)
      .join('\n');

    expect(sql.indexOf('master.supplier_materials')).toBeLessThan(
      sql.indexOf('master.materials'),
    );
    expect(sql.indexOf('master.materials')).toBeLessThan(
      sql.indexOf('master.units'),
    );
    expect(sql).toContain('DROP SCHEMA IF EXISTS master');
    expect(sql).not.toContain('CASCADE');
  });
});
