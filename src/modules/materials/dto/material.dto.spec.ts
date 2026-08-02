import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateMaterialDto } from './create-material.dto';
import { ListMaterialsQueryDto } from './list-materials-query.dto';
import { UpdateMaterialDto } from './update-material.dto';

describe('Material DTOs', () => {
  it('normalizes and accepts a valid create payload', async () => {
    const dto = plainToInstance(CreateMaterialDto, {
      code: '  MAT-001  ',
      name: '  Steel coil  ',
      unitId: ' 10 ',
      deliveryTypeId: '',
      modelId: ' 20 ',
      loadingPointId: null,
      processLineName: '   ',
      scale: ' Large ',
      imagePath: '',
      specification: '  ASTM A36  ',
      description: '',
      supplierIds: [' 30 ', '31'],
      isActive: true,
    });

    expect(await validate(dto)).toEqual([]);
    expect(dto).toMatchObject({
      code: 'MAT-001',
      name: 'Steel coil',
      unitId: '10',
      deliveryTypeId: null,
      modelId: '20',
      loadingPointId: null,
      processLineName: null,
      scale: 'Large',
      imagePath: null,
      specification: 'ASTM A36',
      description: null,
      supplierIds: ['30', '31'],
      isActive: true,
    });
  });

  it('rejects missing required values, non-positive IDs, and duplicate suppliers', async () => {
    const dto = plainToInstance(CreateMaterialDto, {
      code: '   ',
      name: '',
      unitId: '0',
      deliveryTypeId: '-1',
      supplierIds: ['2', '2'],
    });

    const errors = await validate(dto);
    const properties = errors.map((error) => error.property);

    expect(properties).toEqual(
      expect.arrayContaining([
        'code',
        'name',
        'unitId',
        'deliveryTypeId',
        'supplierIds',
      ]),
    );
  });

  it('accepts a partial update only with an ISO concurrency token', async () => {
    const dto = plainToInstance(UpdateMaterialDto, {
      code: '  MAT-002 ',
      description: '   ',
      deliveryTypeId: '',
      supplierIds: [' 8 ', '9'],
      updatedAt: '2026-08-02T14:30:00.000Z',
    });

    expect(await validate(dto)).toEqual([]);
    expect(dto).toMatchObject({
      code: 'MAT-002',
      description: null,
      deliveryTypeId: null,
      supplierIds: ['8', '9'],
    });

    const missingToken = plainToInstance(UpdateMaterialDto, { name: 'Steel' });
    const invalidToken = plainToInstance(UpdateMaterialDto, {
      updatedAt: '02/08/2026',
    });

    expect(
      (await validate(missingToken)).map((error) => error.property),
    ).toContain('updatedAt');
    expect(
      (await validate(invalidToken)).map((error) => error.property),
    ).toContain('updatedAt');
  });

  it('applies query defaults and transforms supported filters', async () => {
    const defaults = plainToInstance(ListMaterialsQueryDto, {});
    const dto = plainToInstance(ListMaterialsQueryDto, {
      page: '2',
      limit: '100',
      search: '  coil ',
      isActive: 'false',
      unitId: ' 1 ',
      modelId: '',
      deliveryTypeId: '2',
      loadingPointId: '3',
      supplierId: '4',
      sortBy: 'name',
      sortOrder: 'desc',
    });

    expect(await validate(defaults)).toEqual([]);
    expect(defaults).toMatchObject({
      page: 1,
      limit: 20,
      sortBy: 'code',
      sortOrder: 'asc',
    });
    expect(await validate(dto)).toEqual([]);
    expect(dto).toMatchObject({
      page: 2,
      limit: 100,
      search: 'coil',
      isActive: false,
      unitId: '1',
      modelId: null,
      deliveryTypeId: '2',
      loadingPointId: '3',
      supplierId: '4',
      sortBy: 'name',
      sortOrder: 'desc',
    });
  });

  it('rejects oversized pages, malformed filters, and unsupported sorting', async () => {
    const dto = plainToInstance(ListMaterialsQueryDto, {
      page: '0',
      limit: '101',
      isActive: 'yes',
      unitId: '1.5',
      supplierId: '-2',
      sortBy: 'supplier.name',
      sortOrder: 'sideways',
    });

    const properties = (await validate(dto)).map((error) => error.property);

    expect(properties).toEqual(
      expect.arrayContaining([
        'page',
        'limit',
        'isActive',
        'unitId',
        'supplierId',
        'sortBy',
        'sortOrder',
      ]),
    );
  });
});
