import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateSupplierDto } from './create-supplier.dto';
import { UpdateSupplierDto } from './update-supplier.dto';
import { ListSuppliersQueryDto } from './list-suppliers-query.dto';

async function validateDto<T extends object>(cls: new () => T, payload: unknown) {
  const instance = plainToInstance(cls, payload);
  const errors = await validate(instance as object, {
    whitelist: true,
    forbidNonWhitelisted: false,
  });
  return { instance, errors };
}

describe('CreateSupplierDto', () => {
  it('accepts a valid payload with optional contact fields', async () => {
    const { instance, errors } = await validateDto(CreateSupplierDto, {
      code: ' SUP-001 ',
      nameTh: ' บริษัท ABC ',
      nameEn: ' ABC Co. ',
      taxId: '0105560001234',
      contactName: 'สมชาย',
      telephone: '02-123-4567',
      email: 'contact@abc.co.th',
      address: 'Bangkok',
    });
    expect(errors).toHaveLength(0);
    expect(instance.code).toBe('SUP-001');
    expect(instance.nameTh).toBe('บริษัท ABC');
    expect(instance.nameEn).toBe('ABC Co.');
    expect(instance.taxId).toBe('0105560001234');
  });

  it('rejects invalid email format', async () => {
    const { errors } = await validateDto(CreateSupplierDto, {
      code: 'SUP-001',
      nameTh: 'บริษัท',
      email: 'not-an-email',
    });
    expect(errors.some((e) => e.property === 'email')).toBe(true);
  });

  it('converts empty optional strings to null', async () => {
    const { instance, errors } = await validateDto(CreateSupplierDto, {
      code: 'SUP-001',
      nameTh: 'บริษัท',
      nameEn: '   ',
      taxId: '',
      email: '  ',
    });
    expect(errors).toHaveLength(0);
    expect(instance.nameEn).toBeNull();
    expect(instance.taxId).toBeNull();
    expect(instance.email).toBeNull();
  });
});

describe('UpdateSupplierDto', () => {
  it('requires updatedAt', async () => {
    const { errors } = await validateDto(UpdateSupplierDto, {
      nameTh: 'บริษัท',
    });
    expect(errors.some((e) => e.property === 'updatedAt')).toBe(true);
  });
});

describe('ListSuppliersQueryDto', () => {
  it('applies default values', async () => {
    const { instance, errors } = await validateDto(ListSuppliersQueryDto, {});
    expect(errors).toHaveLength(0);
    expect(instance.page).toBe(1);
    expect(instance.limit).toBe(20);
    expect(instance.sortBy).toBe('code');
  });
});
