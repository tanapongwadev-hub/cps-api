import { getMetadataArgsStorage } from 'typeorm';
import { Supplier } from './supplier.entity';

describe('Supplier entity', () => {
  const storage = getMetadataArgsStorage();

  it('maps to master.suppliers with a unique code', () => {
    const table = storage.tables.find((item) => item.target === Supplier);
    const uniqueCode = storage.indices.find(
      (item) =>
        item.target === Supplier &&
        item.unique === true &&
        JSON.stringify(item.columns) === JSON.stringify(['code']),
    );

    expect(table).toMatchObject({ name: 'suppliers', schema: 'master' });
    expect(uniqueCode).toBeDefined();
  });

  it('maps the approved supplier identity and contact fields', () => {
    const column = (propertyName: string) =>
      storage.columns.find(
        (item) =>
          item.target === Supplier && item.propertyName === propertyName,
      );

    expect(column('code')?.options).toMatchObject({
      type: 'varchar',
      length: 50,
    });
    expect(column('nameTh')?.options).toMatchObject({
      name: 'name_th',
      type: 'varchar',
      length: 255,
    });
    expect(column('nameEn')?.options).toMatchObject({
      name: 'name_en',
      length: 255,
      nullable: true,
    });
    expect(column('taxId')?.options).toMatchObject({
      name: 'tax_id',
      length: 20,
      nullable: true,
    });
    expect(column('contactName')?.options).toMatchObject({
      name: 'contact_name',
      length: 255,
      nullable: true,
    });
    expect(column('telephone')?.options).toMatchObject({
      length: 50,
      nullable: true,
    });
    expect(column('email')?.options).toMatchObject({
      length: 255,
      nullable: true,
    });
    expect(column('address')?.options).toMatchObject({
      type: 'text',
      nullable: true,
    });
  });
});
