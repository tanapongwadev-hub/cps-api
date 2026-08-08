import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateUnitDto } from './create-unit.dto';
import { UpdateUnitDto } from './update-unit.dto';
import { ListUnitsQueryDto } from './list-units-query.dto';

async function validateDto<T extends object>(
  cls: new () => T,
  payload: unknown,
) {
  const instance = plainToInstance(cls, payload);
  const errors = await validate(instance as object, {
    whitelist: true,
    forbidNonWhitelisted: false,
  });
  return { instance, errors };
}

describe('CreateUnitDto', () => {
  it('accepts a valid payload and trims required strings', async () => {
    const { instance, errors } = await validateDto(CreateUnitDto, {
      code: ' PCS ',
      nameTh: ' ชิ้น ',
    });
    expect(errors).toHaveLength(0);
    expect(instance.code).toBe('PCS');
    expect(instance.nameTh).toBe('ชิ้น');
  });

  it('converts empty optional strings to null', async () => {
    const { instance, errors } = await validateDto(CreateUnitDto, {
      code: 'PCS',
      nameTh: 'ชิ้น',
      nameEn: '   ',
      symbol: '',
      description: '  ',
    });
    expect(errors).toHaveLength(0);
    expect(instance.nameEn).toBeNull();
    expect(instance.symbol).toBeNull();
    expect(instance.description).toBeNull();
  });

  it('rejects empty required code', async () => {
    const { errors } = await validateDto(CreateUnitDto, {
      code: '   ',
      nameTh: 'ชิ้น',
    });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.property === 'code')).toBe(true);
  });

  it('rejects code longer than 20 chars', async () => {
    const { errors } = await validateDto(CreateUnitDto, {
      code: 'A'.repeat(21),
      nameTh: 'ชิ้น',
    });
    expect(errors.some((e) => e.property === 'code')).toBe(true);
  });

  it('defaults isActive to true when omitted', async () => {
    const { instance, errors } = await validateDto(CreateUnitDto, {
      code: 'PCS',
      nameTh: 'ชิ้น',
    });
    expect(errors).toHaveLength(0);
    expect(instance.isActive).toBeUndefined();
  });
});

describe('UpdateUnitDto', () => {
  it('requires updatedAt concurrency token', async () => {
    const { errors } = await validateDto(UpdateUnitDto, { nameTh: 'กิโลกรัม' });
    expect(errors.some((e) => e.property === 'updatedAt')).toBe(true);
  });

  it('accepts a valid partial update', async () => {
    const { instance, errors } = await validateDto(UpdateUnitDto, {
      nameTh: ' กิโลกรัม ',
      updatedAt: '2026-08-04T00:00:00.000Z',
    });
    expect(errors).toHaveLength(0);
    expect(instance.nameTh).toBe('กิโลกรัม');
    expect(instance.updatedAt).toBe('2026-08-04T00:00:00.000Z');
  });
});

describe('ListUnitsQueryDto', () => {
  it('applies default page/limit/sortBy', async () => {
    const { instance, errors } = await validateDto(ListUnitsQueryDto, {});
    expect(errors).toHaveLength(0);
    expect(instance.page).toBe(1);
    expect(instance.limit).toBe(20);
    expect(instance.sortBy).toBe('code');
    expect(instance.sortOrder).toBe('asc');
  });

  it('coerces page/limit from string query params', async () => {
    const { instance, errors } = await validateDto(ListUnitsQueryDto, {
      page: '2',
      limit: '50',
      search: ' ชิ้น ',
      isActive: 'true',
      sortBy: 'nameTh',
      sortOrder: 'desc',
    });
    expect(errors).toHaveLength(0);
    expect(instance.page).toBe(2);
    expect(instance.limit).toBe(50);
    expect(instance.search).toBe('ชิ้น');
    expect(instance.isActive).toBe(true);
    expect(instance.sortBy).toBe('nameTh');
    expect(instance.sortOrder).toBe('desc');
  });

  it('rejects unknown sortBy values', async () => {
    const { errors } = await validateDto(ListUnitsQueryDto, {
      sortBy: 'description',
    });
    expect(errors.some((e) => e.property === 'sortBy')).toBe(true);
  });

  it('rejects limit over 100', async () => {
    const { errors } = await validateDto(ListUnitsQueryDto, { limit: 200 });
    expect(errors.some((e) => e.property === 'limit')).toBe(true);
  });
});
