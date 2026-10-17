import { BadRequestException, ConflictException } from '@nestjs/common';
import { QueryFailedError, Repository } from 'typeorm';
import { AuditLog } from '../../entities/iam/audit-log.entity';
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
    remove: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
}

function queryBuilder(result: Record<string, unknown>) {
  return {
    select: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    ...result,
  };
}

describe('UsersService create / status / password / delete', () => {
  let users: RepositoryStub<User>;
  let assignments: RepositoryStub<UserDepartmentRole>;
  let assignmentPermissions: RepositoryStub<UserDepartmentPermission>;
  let departments: RepositoryStub<Department>;
  let roles: RepositoryStub<Role>;
  let auditLogs: RepositoryStub<AuditLog>;
  let transaction: jest.Mock;
  let service: UsersService;

  beforeEach(() => {
    users = repositoryStub<User>();
    assignments = repositoryStub<UserDepartmentRole>();
    assignmentPermissions = repositoryStub<UserDepartmentPermission>();
    departments = repositoryStub<Department>();
    roles = repositoryStub<Role>();
    auditLogs = repositoryStub<AuditLog>();
    for (const stub of [users, assignments, assignmentPermissions, auditLogs]) {
      stub.create!.mockImplementation((value: unknown) => value);
      stub.save!.mockImplementation(async (value: { id?: string }) => ({
        id: value.id ?? '50',
        ...value,
      }));
    }
    roles.find!.mockResolvedValue([
      { id: '4', code: 'OPERATOR', scopeType: 'DEPARTMENT', isActive: true },
      { id: '1', code: 'SUPER_ADMIN', scopeType: 'SYSTEM', isActive: true },
    ]);
    departments.find!.mockResolvedValue([
      { id: '2', code: 'WE', isActive: true },
    ]);

    const manager = {
      getRepository: (entity: unknown) => {
        if (entity === User) return users;
        if (entity === UserDepartmentRole) return assignments;
        if (entity === UserDepartmentPermission) return assignmentPermissions;
        if (entity === Department) return departments;
        if (entity === Role) return roles;
        if (entity === AuditLog) return auditLogs;
        throw new Error('Unexpected repository');
      },
    };
    transaction = jest.fn(async (callback) => callback(manager));
    (users as { manager?: { transaction: jest.Mock } }).manager = {
      transaction,
    };
    service = new UsersService(
      users as unknown as Repository<User>,
      assignments as unknown as Repository<UserDepartmentRole>,
      assignmentPermissions as unknown as Repository<UserDepartmentPermission>,
    );
  });

  describe('create', () => {
    const dto = {
      username: 'Operator1',
      password: 'secret1',
      firstName: 'Op',
      lastName: 'One',
      email: 'Op@Example.com',
      assignments: [{ departmentId: '2', roleId: '4' }],
    };

    it('creates the user and assignments in one transaction with an audit row', async () => {
      users.findOne!
        .mockResolvedValueOnce(null) // username
        .mockResolvedValueOnce(null) // email
        .mockResolvedValueOnce({ id: '50', username: 'operator1' }); // findOne

      await service.create(dto, '99');

      expect(transaction).toHaveBeenCalledTimes(1);
      expect(users.create).toHaveBeenCalledWith(
        expect.objectContaining({
          username: 'operator1',
          email: 'op@example.com',
        }),
      );
      expect(assignments.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: '50', departmentId: '2', roleId: '4' }),
      );
      const auditRow = auditLogs.create!.mock.calls[0][0] as AuditLog;
      expect(auditRow).toMatchObject({
        eventName: 'iam.user.created',
        targetType: 'USER',
        targetId: '50',
        actorUserId: '99',
      });
      expect(JSON.stringify(auditRow.afterData)).not.toContain('passwordHash');
    });

    it('accepts a null department for a system role', async () => {
      users.findOne!
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: '50', username: 'operator1' });

      await service.create({
        ...dto,
        assignments: [{ departmentId: null, roleId: '1' }],
      });

      expect(assignments.create).toHaveBeenCalledWith(
        expect.objectContaining({ departmentId: null, roleId: '1' }),
      );
    });

    it('rejects a department role without a department before any write', async () => {
      users.findOne!.mockResolvedValue(null);

      await expect(
        service.create({
          ...dto,
          assignments: [{ departmentId: null, roleId: '4' }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(users.save).not.toHaveBeenCalled();
      expect(auditLogs.save).not.toHaveBeenCalled();
    });
  });

  it('filters the list by status and attaches each user’s assignments', async () => {
    const usersQuery = queryBuilder({
      getManyAndCount: jest.fn().mockResolvedValue([[{ id: '7' }], 1]),
    });
    users.createQueryBuilder!.mockReturnValue(usersQuery);
    assignments.createQueryBuilder!.mockReturnValue(
      queryBuilder({
        getMany: jest.fn().mockResolvedValue([
          {
            id: '10',
            userId: '7',
            departmentId: '2',
            roleId: '4',
            isActive: true,
            department: { id: '2', code: 'WE', nameTh: 'เชื่อม' },
            role: { id: '4', code: 'OPERATOR', nameTh: 'พนักงาน', scopeType: 'DEPARTMENT' },
          },
        ]),
      }),
    );

    const result = await service.findAll(1, 20, undefined, 'inactive');

    expect(usersQuery.andWhere).toHaveBeenCalledWith('user.isActive = :isActive', {
      isActive: false,
    });
    expect(result.items[0].assignments).toEqual([
      expect.objectContaining({
        id: '10',
        department: { id: '2', code: 'WE', nameTh: 'เชื่อม' },
      }),
    ]);
  });

  it('resets the password, revokes sessions and audits without the password', async () => {
    const user = { id: '7', username: 'op', permissionVersion: 3 } as User;
    users.findOne!.mockResolvedValue(user);

    await service.resetPassword('7', 'newsecret', '99');

    expect(user.permissionVersion).toBe(4);
    expect(user.passwordHash).not.toBe('newsecret');
    const auditRow = auditLogs.create!.mock.calls[0][0] as AuditLog;
    expect(auditRow).toMatchObject({ eventName: 'iam.user.password_reset' });
    expect(JSON.stringify(auditRow)).not.toContain('newsecret');
  });

  it('audits deactivation and skips a no-op status change', async () => {
    const user = { id: '7', username: 'op', isActive: true } as User;
    users.findOne!.mockResolvedValue(user);
    assignments.createQueryBuilder!.mockReturnValue(
      queryBuilder({ getCount: jest.fn().mockResolvedValue(3) }),
    );

    await service.updateStatus('7', { isActive: false }, '99');
    expect(auditLogs.create).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: 'iam.user.deactivated' }),
    );

    auditLogs.create!.mockClear();
    await service.updateStatus('7', { isActive: false }, '99');
    expect(auditLogs.create).not.toHaveBeenCalled();
  });

  it('maps a foreign-key failure on delete to a 409', async () => {
    users.findOne!.mockResolvedValue({ id: '7', username: 'op' });
    assignments.createQueryBuilder!.mockReturnValue(
      queryBuilder({ getCount: jest.fn().mockResolvedValue(3) }),
    );
    assignments.find!.mockResolvedValue([]);
    const fkError = new QueryFailedError('DELETE', [], new Error('fk'));
    (fkError as QueryFailedError & { code: string }).code = '23503';
    users.remove!.mockRejectedValue(fkError);

    await expect(service.remove('7')).rejects.toBeInstanceOf(ConflictException);
  });
});
