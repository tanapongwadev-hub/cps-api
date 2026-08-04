import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateMaterialModelDto } from './create-material-model.dto';
import { UpdateMaterialModelDto } from './update-material-model.dto';
import { ListMaterialModelsQueryDto } from './list-material-models-query.dto';

async function validateDto<T extends object>(cls: new () => T, payload: unknown) {
  const instance = plainToInstance(cls, payload);
  const errors = await validate(instance as object, {
    whitelist: true,
    forbidNonWhitelisted: false,
  });
  return { instance, errors };
}

describe('CreateMaterialModelDto', () => {
  it('accepts a valid payload', async () => {
    const { instance, errors } = await validateDto(CreateMaterialModelDto, {
      code: ' MD-01 ',
      nameTh: ' รุ่น A ',
      nameEn: ' Model A ',
      description: ' ใช้กับงานเชื่อม ',
    });
    expect(errors).toHaveLength(0);
    expect(instance.code).toBe('MD-01');
    expect(instance.nameTh).toBe('รุ่น A');
    expect(instance.nameEn).toBe('Model A');
    expect(instance.description).toBe('ใช้กับงานเชื่อม');
  });

  it('converts empty optional strings to null', async () => {
    const { instance, errors } = await validateDto(CreateMaterialModelDto, {
      code: 'MD-01',
      nameTh: 'รุ่น A',
      nameEn: '  ',
      description: '',
    });
    expect(errors).toHaveLength(0);
    expect(instance.nameEn).toBeNull();
    expect(instance.description).toBeNull();
  });
});

describe('UpdateMaterialModelDto', () => {
  it('requires updatedAt', async () => {
    const { errors } = await validateDto(UpdateMaterialModelDto, { nameTh: 'x' });
    expect(errors.some((e) => e.property === 'updatedAt')).toBe(true);
  });
});

describe('ListMaterialModelsQueryDto', () => {
  it('applies default values', async () => {
    const { instance, errors } = await validateDto(ListMaterialModelsQueryDto, {});
    expect(errors).toHaveLength(0);
    expect(instance.page).toBe(1);
    expect(instance.limit).toBe(20);
  });
});
