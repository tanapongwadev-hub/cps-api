import { getMetadataArgsStorage } from 'typeorm';
import { Material } from './material.entity';

describe('Material entity', () => {
  const storage = getMetadataArgsStorage();

  it('maps to master.materials with one unique company code', () => {
    const table = storage.tables.find((item) => item.target === Material);
    const uniqueCode = storage.indices.find(
      (item) =>
        item.target === Material &&
        item.unique === true &&
        JSON.stringify(item.columns) === JSON.stringify(['code']),
    );

    expect(table).toMatchObject({ name: 'materials', schema: 'master' });
    expect(uniqueCode).toBeDefined();
  });

  it('uses one required name and the approved optional material fields', () => {
    const column = (propertyName: string) =>
      storage.columns.find(
        (item) =>
          item.target === Material && item.propertyName === propertyName,
      );

    expect(column('name')?.options).toMatchObject({
      type: 'varchar',
      length: 255,
    });
    expect(column('nameTh')).toBeUndefined();
    expect(column('nameEn')).toBeUndefined();
    expect(column('processLineId')).toBeUndefined();
    expect(column('unitId')?.options).toMatchObject({
      name: 'unit_id',
      type: 'bigint',
    });
    expect(column('deliveryTypeId')?.options).toMatchObject({
      name: 'delivery_type_id',
      type: 'bigint',
      nullable: true,
    });
    expect(column('modelId')?.options).toMatchObject({
      name: 'model_id',
      type: 'bigint',
      nullable: true,
    });
    expect(column('loadingPointId')?.options).toMatchObject({
      name: 'loading_point_id',
      type: 'bigint',
      nullable: true,
    });
    expect(column('processLineName')?.options).toMatchObject({
      name: 'process_line_name',
      type: 'varchar',
      length: 255,
      nullable: true,
    });
    expect(column('scale')?.options).toMatchObject({
      type: 'varchar',
      length: 255,
      nullable: true,
    });
    expect(column('imagePath')?.options).toMatchObject({
      name: 'image_path',
      type: 'varchar',
      length: 500,
      nullable: true,
    });
  });

  it('joins the required and optional lookup masters', () => {
    const joinColumns = storage.joinColumns
      .filter((item) => item.target === Material)
      .map((item) => [item.propertyName, item.name]);

    expect(joinColumns).toEqual(
      expect.arrayContaining([
        ['unit', 'unit_id'],
        ['deliveryType', 'delivery_type_id'],
        ['model', 'model_id'],
        ['loadingPoint', 'loading_point_id'],
      ]),
    );
  });
});
