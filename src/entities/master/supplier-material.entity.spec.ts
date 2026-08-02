import { getMetadataArgsStorage } from 'typeorm';
import { Material } from './material.entity';
import { SupplierMaterial } from './supplier-material.entity';
import { Supplier } from './supplier.entity';

describe('SupplierMaterial entity', () => {
  const storage = getMetadataArgsStorage();

  it('maps the unique Material and Supplier pair', () => {
    const table = storage.tables.find(
      (item) => item.target === SupplierMaterial,
    );
    const uniquePair = storage.indices.find(
      (item) =>
        item.target === SupplierMaterial &&
        item.unique === true &&
        JSON.stringify(item.columns) ===
          JSON.stringify(['materialId', 'supplierId']),
    );

    expect(table).toMatchObject({
      name: 'supplier_materials',
      schema: 'master',
    });
    expect(uniquePair).toBeDefined();
  });

  it('maps status and audit columns', () => {
    const column = (propertyName: string) =>
      storage.columns.find(
        (item) =>
          item.target === SupplierMaterial &&
          item.propertyName === propertyName,
      );

    expect(column('materialId')?.options).toMatchObject({
      name: 'material_id',
      type: 'bigint',
    });
    expect(column('supplierId')?.options).toMatchObject({
      name: 'supplier_id',
      type: 'bigint',
    });
    expect(column('isActive')?.options).toMatchObject({
      name: 'is_active',
      type: 'boolean',
      default: true,
    });
    expect(column('createdBy')?.options).toMatchObject({
      name: 'created_by',
      type: 'bigint',
      nullable: true,
    });
    expect(column('updatedBy')?.options).toMatchObject({
      name: 'updated_by',
      type: 'bigint',
      nullable: true,
    });
  });

  it('uses RESTRICT joins and exposes inverse collections', () => {
    const joinColumns = storage.joinColumns
      .filter((item) => item.target === SupplierMaterial)
      .map((item) => [item.propertyName, item.name]);
    const associationRelations = storage.relations.filter(
      (item) => item.target === SupplierMaterial,
    );
    const materialInverse = storage.relations.find(
      (item) =>
        item.target === Material && item.propertyName === 'supplierMaterials',
    );
    const supplierInverse = storage.relations.find(
      (item) =>
        item.target === Supplier && item.propertyName === 'supplierMaterials',
    );

    expect(joinColumns).toEqual(
      expect.arrayContaining([
        ['material', 'material_id'],
        ['supplier', 'supplier_id'],
      ]),
    );
    expect(associationRelations).toHaveLength(2);
    expect(
      associationRelations.every(
        (item) =>
          item.relationType === 'many-to-one' &&
          item.options.onDelete === 'RESTRICT',
      ),
    ).toBe(true);
    expect(materialInverse?.relationType).toBe('one-to-many');
    expect(supplierInverse?.relationType).toBe('one-to-many');
  });
});
