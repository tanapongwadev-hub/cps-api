import 'reflect-metadata';
import { ArgumentMetadata, BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CustomValidationPipe } from '../../../common/pipes/validation.pipe';
import { CreateMaterialDto } from './create-material.dto';
import { ListMaterialsQueryDto } from './list-materials-query.dto';
import { UpdateMaterialDto } from './update-material.dto';

describe('Material DTOs', () => {
  const pipe = new CustomValidationPipe();

  function transformThroughProductionPipe<T>(
    value: unknown,
    metatype: new () => T,
    type: ArgumentMetadata['type'],
  ): Promise<T> {
    return pipe.transform(value, { metatype, type });
  }

  it('normalizes and accepts a valid create payload', async () => {
    const dto = plainToInstance(CreateMaterialDto, {
      code: '  MAT-001  ',
      name: '  Steel coil  ',
      type: '  PC  ',
      materialType: '  PIPE  ',
      ratio: 4,
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
      type: 'PC',
      materialType: 'PIPE',
      ratio: 4,
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
        'materialType',
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
      type: '  PC  ',
      materialType: '  PIPE  ',
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
      type: 'PC',
      materialType: 'PIPE',
      supplierId: '4',
      sortBy: 'name',
      sortOrder: 'desc',
    });
  });

  it('rejects unsupported materialType and non-positive ratio', async () => {
    const badMaterialType = plainToInstance(CreateMaterialDto, {
      code: 'MAT-002',
      name: 'Steel',
      unitId: '1',
      materialType: 'WIRE',
    });
    const badRatio = plainToInstance(CreateMaterialDto, {
      code: 'MAT-003',
      name: 'Steel',
      unitId: '1',
      ratio: 0,
    });

    const materialTypeErrors = (await validate(badMaterialType)).map(
      (error) => error.property,
    );
    const ratioErrors = (await validate(badRatio)).map(
      (error) => error.property,
    );

    expect(materialTypeErrors).toContain('materialType');
    expect(ratioErrors).toContain('ratio');
  });

  it('requires ratio when creating with PIPE / SHEET / COIL but not for PCS', async () => {
    const pipeMissingRatio = plainToInstance(CreateMaterialDto, {
      code: 'MAT-P1',
      name: 'Rebar',
      unitId: '1',
      materialType: 'PIPE',
    });
    const pcsWithRatio = plainToInstance(CreateMaterialDto, {
      code: 'MAT-P2',
      name: 'Bolt',
      unitId: '1',
      materialType: 'PCS',
      ratio: 4,
    });
    const pcsWithoutRatio = plainToInstance(CreateMaterialDto, {
      code: 'MAT-P3',
      name: 'Bolt',
      unitId: '1',
      materialType: 'PCS',
    });
    const sheetWithRatio = plainToInstance(CreateMaterialDto, {
      code: 'MAT-P4',
      name: 'Plate',
      unitId: '1',
      materialType: 'SHEET',
      ratio: 2,
    });

    const pipeErrors = (await validate(pipeMissingRatio)).map(
      (error) => error.property,
    );
    const pcsWithErrors = (await validate(pcsWithRatio)).map(
      (error) => error.property,
    );
    const pcsWithoutErrors = await validate(pcsWithoutRatio);
    const sheetErrors = await validate(sheetWithRatio);

    expect(pipeErrors).toContain('ratio');
    // PCS + ratio → ratio is not validated (service will reject it)
    expect(pcsWithErrors).toEqual([]);
    // PCS + no ratio → valid
    expect(pcsWithoutErrors).toEqual([]);
    // SHEET + ratio → valid
    expect(sheetErrors).toEqual([]);
  });

  it('parses false and rejects malformed booleans through the production pipe', async () => {
    await expect(
      transformThroughProductionPipe(
        { isActive: 'false' },
        ListMaterialsQueryDto,
        'query',
      ),
    ).resolves.toMatchObject({ isActive: false });

    await expect(
      transformThroughProductionPipe(
        { isActive: 'yes' },
        ListMaterialsQueryDto,
        'query',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each([
    {
      dto: CreateMaterialDto,
      valid: {
        code: 'MAT-001',
        name: 'Steel',
        unitId: '7',
        materialType: 'PCS',
      },
      numericId: {
        code: 'MAT-001',
        name: 'Steel',
        unitId: 7,
        materialType: 'PCS',
      },
      stringBoolean: {
        code: 'MAT-001',
        name: 'Steel',
        unitId: '7',
        materialType: 'PCS',
        isActive: 'false',
      },
    },
    {
      dto: UpdateMaterialDto,
      valid: { unitId: '7', updatedAt: '2026-08-02T14:30:00.000Z' },
      numericId: { unitId: 7, updatedAt: '2026-08-02T14:30:00.000Z' },
      stringBoolean: {
        isActive: 'false',
        updatedAt: '2026-08-02T14:30:00.000Z',
      },
    },
  ])(
    'preserves raw body types for $dto.name under the production pipe',
    async ({ dto, valid, numericId, stringBoolean }) => {
      await expect(
        transformThroughProductionPipe(valid, dto, 'body'),
      ).resolves.toBeInstanceOf(dto);
      await expect(
        transformThroughProductionPipe(numericId, dto, 'body'),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        transformThroughProductionPipe(stringBoolean, dto, 'body'),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );

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
