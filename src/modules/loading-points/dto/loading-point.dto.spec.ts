import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateLoadingPointDto } from './create-loading-point.dto';
import { UpdateLoadingPointDto } from './update-loading-point.dto';
import { ListLoadingPointsQueryDto } from './list-loading-points-query.dto';

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

describe('CreateLoadingPointDto', () => {
  it('accepts a valid payload', async () => {
    const { instance, errors } = await validateDto(CreateLoadingPointDto, {
      code: ' LP-01 ',
      nameTh: ' จุดขนถ่าย A ',
      nameEn: ' Loading Point A ',
      description: ' ใช้สำหรับงานกลาง ',
    });
    expect(errors).toHaveLength(0);
    expect(instance.code).toBe('LP-01');
    expect(instance.nameTh).toBe('จุดขนถ่าย A');
    expect(instance.nameEn).toBe('Loading Point A');
    expect(instance.description).toBe('ใช้สำหรับงานกลาง');
  });

  it('converts empty optional strings to null', async () => {
    const { instance, errors } = await validateDto(CreateLoadingPointDto, {
      code: 'LP-01',
      nameTh: 'จุดขนถ่าย A',
      nameEn: '   ',
      description: '',
    });
    expect(errors).toHaveLength(0);
    expect(instance.nameEn).toBeNull();
    expect(instance.description).toBeNull();
  });
});

describe('UpdateLoadingPointDto', () => {
  it('requires updatedAt', async () => {
    const { errors } = await validateDto(UpdateLoadingPointDto, {
      nameTh: 'x',
    });
    expect(errors.some((e) => e.property === 'updatedAt')).toBe(true);
  });
});

describe('ListLoadingPointsQueryDto', () => {
  it('applies default values', async () => {
    const { instance, errors } = await validateDto(
      ListLoadingPointsQueryDto,
      {},
    );
    expect(errors).toHaveLength(0);
    expect(instance.page).toBe(1);
    expect(instance.limit).toBe(20);
  });
});
