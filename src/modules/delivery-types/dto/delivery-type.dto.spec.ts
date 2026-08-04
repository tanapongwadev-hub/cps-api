import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateDeliveryTypeDto } from './create-delivery-type.dto';
import { UpdateDeliveryTypeDto } from './update-delivery-type.dto';
import { ListDeliveryTypesQueryDto } from './list-delivery-types-query.dto';

async function validateDto<T extends object>(cls: new () => T, payload: unknown) {
  const instance = plainToInstance(cls, payload);
  const errors = await validate(instance as object, {
    whitelist: true,
    forbidNonWhitelisted: false,
  });
  return { instance, errors };
}

describe('CreateDeliveryTypeDto', () => {
  it('accepts a valid payload and trims strings', async () => {
    const { instance, errors } = await validateDto(CreateDeliveryTypeDto, {
      code: ' DT-01 ',
      nameTh: ' จัดส่งด่วน ',
      nameEn: ' Express ',
      description: ' ภายใน 24 ชม. ',
    });
    expect(errors).toHaveLength(0);
    expect(instance.code).toBe('DT-01');
    expect(instance.nameTh).toBe('จัดส่งด่วน');
    expect(instance.nameEn).toBe('Express');
    expect(instance.description).toBe('ภายใน 24 ชม.');
  });

  it('converts empty optional strings to null', async () => {
    const { instance, errors } = await validateDto(CreateDeliveryTypeDto, {
      code: 'DT-01',
      nameTh: 'จัดส่งด่วน',
      nameEn: '  ',
      description: '',
    });
    expect(errors).toHaveLength(0);
    expect(instance.nameEn).toBeNull();
    expect(instance.description).toBeNull();
  });
});

describe('UpdateDeliveryTypeDto', () => {
  it('requires updatedAt', async () => {
    const { errors } = await validateDto(UpdateDeliveryTypeDto, { nameTh: 'x' });
    expect(errors.some((e) => e.property === 'updatedAt')).toBe(true);
  });
});

describe('ListDeliveryTypesQueryDto', () => {
  it('applies default values', async () => {
    const { instance, errors } = await validateDto(ListDeliveryTypesQueryDto, {});
    expect(errors).toHaveLength(0);
    expect(instance.page).toBe(1);
    expect(instance.limit).toBe(20);
  });
});
