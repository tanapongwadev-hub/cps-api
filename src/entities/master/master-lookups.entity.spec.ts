import { getMetadataArgsStorage } from 'typeorm';
import { DeliveryType } from './delivery-type.entity';
import { LoadingPoint } from './loading-point.entity';
import { MaterialModel } from './material-model.entity';
import { Unit } from './unit.entity';

describe('Material master lookup entities', () => {
  const storage = getMetadataArgsStorage();
  const expected = [
    [Unit, 'units'],
    [DeliveryType, 'delivery_types'],
    [MaterialModel, 'material_models'],
    [LoadingPoint, 'loading_points'],
  ] as const;

  it.each(expected)(
    'maps %p to master.%s with a unique code',
    (target, name) => {
      const table = storage.tables.find((item) => item.target === target);
      const uniqueCode = storage.indices.find(
        (item) =>
          item.target === target &&
          item.unique === true &&
          JSON.stringify(item.columns) === JSON.stringify(['code']),
      );

      expect(table).toMatchObject({ name, schema: 'master' });
      expect(uniqueCode).toBeDefined();
    },
  );

  it.each(expected)(
    '%p exposes the shared lookup and audit columns',
    (target) => {
      const propertyNames = storage.columns
        .filter((item) => item.target === target)
        .map((item) => item.propertyName);

      expect(propertyNames).toEqual(
        expect.arrayContaining([
          'id',
          'code',
          'nameTh',
          'nameEn',
          'description',
          'isActive',
          'createdBy',
          'updatedBy',
          'createdAt',
          'updatedAt',
        ]),
      );
    },
  );

  it('maps the optional unit symbol', () => {
    const symbol = storage.columns.find(
      (item) => item.target === Unit && item.propertyName === 'symbol',
    );

    expect(symbol?.options).toMatchObject({
      type: 'varchar',
      length: 20,
      nullable: true,
    });
  });
});
