import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateCategoryDto } from './create-category.dto';

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

describe('CreateCategoryDto', () => {
  it('accepts a valid payload with optional sortOrder/parentId', async () => {
    const { instance, errors } = await validateDto(CreateCategoryDto, {
      code: 'CAT-01',
      nameTh: 'หมวดหมู่ A',
      parentId: '5',
      sortOrder: 1,
      iconColor: 'blue',
    });
    expect(errors).toHaveLength(0);
    expect(instance.code).toBe('CAT-01');
    expect(instance.sortOrder).toBe(1);
  });

  it('rejects invalid parentId format', async () => {
    const { errors } = await validateDto(CreateCategoryDto, {
      code: 'CAT-01',
      nameTh: 'x',
      parentId: 'abc',
    });
    expect(errors.some((e) => e.property === 'parentId')).toBe(true);
  });

  it('rejects negative sortOrder', async () => {
    const { errors } = await validateDto(CreateCategoryDto, {
      code: 'CAT-01',
      nameTh: 'x',
      sortOrder: -1,
    });
    expect(errors.some((e) => e.property === 'sortOrder')).toBe(true);
  });
});
