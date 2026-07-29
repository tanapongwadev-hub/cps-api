import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Department } from '../../entities/iam/department.entity';
import { Role } from '../../entities/iam/role.entity';
import { User } from '../../entities/iam/user.entity';
import { UserDepartmentPermission } from '../../entities/iam/user-department-permission.entity';
import { UserDepartmentRole } from '../../entities/iam/user-department-role.entity';
import { UsersService } from './users.service';

type RepositoryStub<T extends object> = Partial<
  Record<keyof Repository<T>, jest.Mock>
>;

function repositoryStub<T extends object>(): RepositoryStub<T> {
  return {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
}

describe('UsersService aggregate assignment update', () => {
  let users: RepositoryStub<User>;
  let assignments: RepositoryStub<UserDepartmentRole>;
  let assignmentPermissions: RepositoryStub<UserDepartmentPermission>;
  let departments: RepositoryStub<Department>;
  let roles: RepositoryStub<Role>;
  let service: UsersService;
  let transaction: jest.Mock;
  let user: User;
  let current: UserDepartmentRole[];

  const role = (
    id: string,
    code: string,
    scopeType: 'SYSTEM' | 'DEPARTMENT' = 'DEPARTMENT',
  ) =>
    ({
      id,
      code,
      scopeType,
      isActive: true,
    }) as Role;

  beforeEach(() => {
    users = repositoryStub<User>();
    assignments = repositoryStub<UserDepartmentRole>();
    assignmentPermissions = repositoryStub<UserDepartmentPermission>();
    departments = repositoryStub<Department>();
    roles = repositoryStub<Role>();
    service = new UsersService(
      users as unknown as Repository<User>,
      assignments as unknown as Repository<UserDepartmentRole>,
      assignmentPermissions as unknown as Repository<UserDepartmentPermission>,
    );
    user = {
      id: '7',
      email: 'operator@example.com',
      firstName: 'Old',
      permissionVersion: 4,
    } as User;
    current = [
      {
        id: '10',
        userId: '7',
        departmentId: '2',
        roleId: '4',
        isActive: true,
      },
      {
        id: '11',
        userId: '7',
        departmentId: '2',
        roleId: '6',
        isActive: true,
      },
    ] as UserDepartmentRole[];

    users.findOne!.mockResolvedValue(user);
    users.save!.mockImplementation(async (value: User) => value);
    assignments.find!.mockResolvedValue(current);
    assignments.create!.mockImplementation(
      (value: UserDepartmentRole) => value,
    );
    assignments.save!.mockImplementation(
      async (value: UserDepartmentRole) => value,
    );
    assignments.delete!.mockResolvedValue({ affected: 1 });
    roles.find!.mockResolvedValue([
      role('4', 'OPERATOR'),
      role('5', 'MANAGER'),
      role('6', 'VIEWER'),
      role('8', 'APPROVER'),
      role('1', 'SUPER_ADMIN', 'SYSTEM'),
    ]);
    departments.find!.mockResolvedValue([
      { id: '2', code: 'OLD', isActive: true } as Department,
      { id: '3', code: 'PROD', isActive: true } as Department,
    ]);

    const manager = {
      getRepository: (entity: unknown) => {
        if (entity === User) return users;
        if (entity === UserDepartmentRole) return assignments;
        if (entity === UserDepartmentPermission) {
          return assignmentPermissions;
        }
        if (entity === Department) return departments;
        if (entity === Role) return roles;
        throw new Error('Unexpected repository');
      },
    };
    transaction = jest.fn(async (callback) => callback(manager));
    (users as { manager?: { transaction: jest.Mock } }).manager = {
      transaction,
    };
  });

  it('atomically updates profile and creates, updates, and deletes assignments', async () => {
    const result = await service.update('7', {
      firstName: 'Updated',
      assignments: [
        { id: '10', departmentId: '3', roleId: '5' },
        { departmentId: '3', roleId: '8' },
      ],
    });

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(result).toBe(user);
    expect(user.firstName).toBe('Updated');
    expect(user.permissionVersion).toBe(5);
    expect(assignments.delete).toHaveBeenCalledTimes(1);
    expect(assignments.save).toHaveBeenCalledTimes(2);
    expect(assignmentPermissions.delete).not.toHaveBeenCalled();
    expect(current[0]).toMatchObject({
      id: '10',
      departmentId: '3',
      roleId: '5',
    });
  });

  it('rejects an empty assignment set before any write', async () => {
    await expect(
      service.update('7', { assignments: [] }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(users.save).not.toHaveBeenCalled();
    expect(assignments.save).not.toHaveBeenCalled();
    expect(assignments.delete).not.toHaveBeenCalled();
  });

  it('rejects duplicate department and role pairs', async () => {
    await expect(
      service.update('7', {
        assignments: [
          { id: '10', departmentId: '3', roleId: '5' },
          { id: '11', departmentId: '3', roleId: '5' },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows different roles in the same department', async () => {
    await expect(
      service.update('7', {
        assignments: [
          { id: '10', departmentId: '3', roleId: '5' },
          { id: '11', departmentId: '3', roleId: '8' },
        ],
      }),
    ).resolves.toBe(user);
  });

  it('rejects an assignment id owned by another user', async () => {
    await expect(
      service.update('7', {
        assignments: [{ id: '999', departmentId: '3', roleId: '5' }],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('enforces system and department role scope', async () => {
    await expect(
      service.update('7', {
        assignments: [{ id: '10', departmentId: '3', roleId: '1' }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.update('7', {
        assignments: [{ id: '10', departmentId: null, roleId: '5' }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts a null department for a system role', async () => {
    assignments.createQueryBuilder!.mockReturnValue({
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      setLock: jest.fn().mockReturnThis(),
      getMany: jest
        .fn()
        .mockResolvedValue([
          { id: '90', userId: '8', roleId: '1', isActive: true },
        ]),
    });

    await expect(
      service.update('7', {
        assignments: [{ id: '10', departmentId: null, roleId: '1' }],
      }),
    ).resolves.toBe(user);
  });

  it('does not increment permissionVersion for an unchanged assignment set', async () => {
    await service.update('7', {
      firstName: 'Updated',
      assignments: [
        { id: '10', departmentId: '2', roleId: '4' },
        { id: '11', departmentId: '2', roleId: '6' },
      ],
    });

    expect(user.permissionVersion).toBe(4);
    expect(user.firstName).toBe('Updated');
  });

  it('preserves direct permissions for retained assignment ids', async () => {
    await service.update('7', {
      assignments: [
        { id: '10', departmentId: '3', roleId: '5' },
        { id: '11', departmentId: '2', roleId: '6' },
      ],
    });

    expect(assignmentPermissions.delete).not.toHaveBeenCalled();
  });

  it('rejects removal of the final active super admin', async () => {
    current = [
      {
        id: '10',
        userId: '7',
        departmentId: null,
        roleId: '1',
        isActive: true,
      },
    ] as UserDepartmentRole[];
    assignments.find!.mockResolvedValue(current);
    assignments.createQueryBuilder!.mockReturnValue({
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      setLock: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(current),
    });

    await expect(
      service.update('7', {
        assignments: [{ id: '10', departmentId: '3', roleId: '5' }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('propagates a write failure from the transaction', async () => {
    assignments.save!.mockRejectedValueOnce(new Error('write failed'));

    await expect(
      service.update('7', {
        assignments: [
          { id: '10', departmentId: '3', roleId: '5' },
          { id: '11', departmentId: '2', roleId: '6' },
        ],
      }),
    ).rejects.toThrow('write failed');
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});
