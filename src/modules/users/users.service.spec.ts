import { BadRequestException } from '@nestjs/common';
import { Repository } from 'typeorm';
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
    delete: jest.fn(),
    remove: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    find: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
}

describe('UsersService assignment lifecycle', () => {
  let users: RepositoryStub<User>;
  let assignments: RepositoryStub<UserDepartmentRole>;
  let assignmentPermissions: RepositoryStub<UserDepartmentPermission>;
  let service: UsersService;

  beforeEach(() => {
    users = repositoryStub<User>();
    assignments = repositoryStub<UserDepartmentRole>();
    assignmentPermissions = repositoryStub<UserDepartmentPermission>();

    service = new UsersService(
      users as unknown as Repository<User>,
      assignments as unknown as Repository<UserDepartmentRole>,
      assignmentPermissions as unknown as Repository<UserDepartmentPermission>,
    );
  });

  it('replaces an assignment and its explicit permissions in one transaction', async () => {
    const assignment = {
      id: '22',
      userId: '7',
      departmentId: '3',
      roleId: '4',
      isActive: true,
    } as UserDepartmentRole;
    const transaction = jest.fn(
      async (callback: (manager: unknown) => Promise<unknown>) =>
        callback({
          getRepository: (entity: unknown) =>
            entity === UserDepartmentRole ? assignments : assignmentPermissions,
        }),
    );

    assignments.findOne!.mockResolvedValue(assignment);
    assignments.save!.mockImplementation(
      async (value: UserDepartmentRole) => value,
    );
    assignmentPermissions.delete!.mockResolvedValue({ affected: 1 });
    assignmentPermissions.create!.mockImplementation(
      (value: UserDepartmentPermission) => value,
    );
    assignmentPermissions.save!.mockImplementation(
      async (value: UserDepartmentPermission) => value,
    );
    assignments.createQueryBuilder!.mockReturnValue({
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([assignment]),
    });
    assignmentPermissions.createQueryBuilder!.mockReturnValue({
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    });
    (users as { manager?: { transaction?: jest.Mock } }).manager = {
      transaction,
    };

    const result = await service.updateAssignment('7', '22', {
      departmentId: '9',
      roleId: '4',
      permissionIds: ['100', '101'],
    });

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(assignmentPermissions.delete).toHaveBeenCalledWith({
      userDepartmentRoleId: '22',
    });
    expect(result).toMatchObject({ id: '22', departmentId: '9', roleId: '4' });
  });

  it('deletes a regular user and dependent assignment records in one transaction', async () => {
    const user = { id: '7', username: 'operator' } as User;
    const superAdminCount = { getCount: jest.fn().mockResolvedValue(2) };
    const transaction = jest.fn(
      async (callback: (manager: unknown) => Promise<unknown>) =>
        callback({
          getRepository: (entity: unknown) =>
            entity === User
              ? users
              : entity === UserDepartmentRole
                ? assignments
                : assignmentPermissions,
        }),
    );

    users.findOne!.mockResolvedValue(user);
    assignments.createQueryBuilder!.mockReturnValue({
      leftJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getCount: superAdminCount.getCount,
    });
    assignmentPermissions.delete!.mockResolvedValue({ affected: 2 });
    assignments.find!.mockResolvedValue([{ id: '22' }]);
    assignments.delete!.mockResolvedValue({ affected: 1 });
    users.remove!.mockResolvedValue(user);
    (users as { manager?: { transaction?: jest.Mock } }).manager = {
      transaction,
    };

    await expect(service.remove('7')).resolves.toEqual({
      message: 'User deleted successfully',
    });

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(assignmentPermissions.delete).toHaveBeenCalledWith({
      userDepartmentRoleId: expect.anything(),
    });
    expect(assignments.delete).toHaveBeenCalledWith({ userId: '7' });
    expect(users.remove).toHaveBeenCalledWith(user);
  });

  it('rejects deletion of the last active super admin', async () => {
    const user = { id: '7', username: 'superadmin' } as User;
    const superAdminCount = { getCount: jest.fn().mockResolvedValue(1) };
    const superAdminAssignment = {
      getOne: jest.fn().mockResolvedValue({ id: '22' }),
    };

    users.findOne!.mockResolvedValue(user);
    assignments
      .createQueryBuilder!.mockReturnValueOnce({
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: superAdminCount.getCount,
      })
      .mockReturnValueOnce({
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: superAdminAssignment.getOne,
      });

    await expect(service.remove('7')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(users.remove).not.toHaveBeenCalled();
  });
});
