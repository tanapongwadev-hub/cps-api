import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateUserDto } from './update-user.dto';

describe('UpdateUserDto', () => {
  it('accepts retained, new, and system assignments', async () => {
    const dto = plainToInstance(UpdateUserDto, {
      firstName: 'Somchai',
      assignments: [
        { id: '10', departmentId: '3', roleId: '4' },
        { departmentId: '3', roleId: '5' },
        { id: '20', departmentId: null, roleId: '1' },
      ],
    });

    expect(await validate(dto)).toEqual([]);
  });

  it('rejects an included empty assignment array', async () => {
    const dto = plainToInstance(UpdateUserDto, { assignments: [] });

    expect(await validate(dto)).not.toEqual([]);
  });

  it('rejects an assignment without a role', async () => {
    const dto = plainToInstance(UpdateUserDto, {
      assignments: [{ departmentId: '3' }],
    });

    const errors = await validate(dto);

    expect(errors[0]?.property).toBe('assignments');
    expect(errors[0]?.children?.[0]?.children?.some(
      (child) => child.property === 'roleId',
    )).toBe(true);
  });

  it('rejects an assignment whose department is omitted', async () => {
    const dto = plainToInstance(UpdateUserDto, {
      assignments: [{ roleId: '4' }],
    });

    const errors = await validate(dto);

    expect(errors[0]?.property).toBe('assignments');
    expect(errors[0]?.children?.[0]?.children?.some(
      (child) => child.property === 'departmentId',
    )).toBe(true);
  });
});
