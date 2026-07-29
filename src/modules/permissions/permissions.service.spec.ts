import { BadRequestException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { Action } from '../../entities/iam/action.entity';
import { DepartmentPermission } from '../../entities/iam/department-permission.entity';
import { Department } from '../../entities/iam/department.entity';
import { Menu } from '../../entities/iam/menu.entity';
import { Permission } from '../../entities/iam/permission.entity';
import { PermissionsService } from './permissions.service';

type RepositoryStub<T extends object> = Partial<
  Record<keyof Repository<T>, jest.Mock>
>;

function repositoryStub<T extends object>(): RepositoryStub<T> {
  return {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
}

describe('PermissionsService department restrictions', () => {
  let permissions: RepositoryStub<Permission>;
  let menus: RepositoryStub<Menu>;
  let actions: RepositoryStub<Action>;
  let departments: RepositoryStub<Department>;
  let mappings: RepositoryStub<DepartmentPermission>;
  let dataSource: { transaction: jest.Mock };
  let service: PermissionsService;

  const permission = {
    id: '10',
    code: 'order.approve',
    isActive: true,
  } as Permission;
  const department = {
    id: '1',
    code: 'WE',
    nameTh: 'แผนก WE',
    nameEn: 'WE Department',
  } as Department;

  beforeEach(() => {
    permissions = repositoryStub<Permission>();
    menus = repositoryStub<Menu>();
    actions = repositoryStub<Action>();
    departments = repositoryStub<Department>();
    mappings = repositoryStub<DepartmentPermission>();
    dataSource = {
      transaction: jest.fn(),
    };
    service = new PermissionsService(
      permissions as unknown as Repository<Permission>,
      menus as unknown as Repository<Menu>,
      actions as unknown as Repository<Action>,
      departments as unknown as Repository<Department>,
      mappings as unknown as Repository<DepartmentPermission>,
      dataSource as unknown as DataSource,
    );
  });

  it('returns active departments on permission detail', async () => {
    permissions.findOne!.mockResolvedValue(permission);
    mappings.find!.mockResolvedValue([
      {
        id: '100',
        permissionId: '10',
        departmentId: '1',
        isActive: true,
        department,
      },
    ]);

    await expect(service.findOne('10')).resolves.toMatchObject({
      id: '10',
      departments: [
        {
          id: '1',
          code: 'WE',
          nameTh: 'แผนก WE',
          nameEn: 'WE Department',
        },
      ],
    });
  });

  it('returns an empty department list when the permission is unrestricted', async () => {
    permissions.findOne!.mockResolvedValue(permission);
    mappings.find!.mockResolvedValue([]);

    await expect(service.findOne('10')).resolves.toMatchObject({
      id: '10',
      departments: [],
    });
  });

  it('deactivates omitted mappings and activates selected mappings atomically', async () => {
    const transactionPermissions = repositoryStub<Permission>();
    const transactionDepartments = repositoryStub<Department>();
    const transactionMappings = repositoryStub<DepartmentPermission>();
    const oldMapping = {
      id: '100',
      permissionId: '10',
      departmentId: '1',
      isActive: true,
    } as DepartmentPermission;
    const newDepartment = { ...department, id: '2', code: 'PS' };

    transactionPermissions.findOne!.mockResolvedValue(permission);
    transactionDepartments.find!.mockResolvedValue([newDepartment]);
    transactionMappings.find!.mockResolvedValue([oldMapping]);
    transactionMappings.create!.mockImplementation(
      (value: DepartmentPermission) => value,
    );
    transactionMappings.save!.mockImplementation(
      async (value: DepartmentPermission[]) => value,
    );
    dataSource.transaction.mockImplementation(
      async (callback: (manager: { getRepository: Function }) => unknown) =>
        callback({
          getRepository: (entity: unknown) => {
            if (entity === Permission) return transactionPermissions;
            if (entity === Department) return transactionDepartments;
            return transactionMappings;
          },
        }),
    );
    permissions.findOne!.mockResolvedValue(permission);
    mappings.find!.mockResolvedValue([
      {
        permissionId: '10',
        departmentId: '2',
        isActive: true,
        department: newDepartment,
      },
    ]);

    await expect(
      service.updateDepartments('10', ['2']),
    ).resolves.toMatchObject({
      departments: [expect.objectContaining({ id: '2', code: 'PS' })],
    });
    expect(transactionMappings.save).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ departmentId: '1', isActive: false }),
        expect.objectContaining({ departmentId: '2', isActive: true }),
      ]),
    );
  });

  it('rejects unknown department IDs without saving mappings', async () => {
    const transactionPermissions = repositoryStub<Permission>();
    const transactionDepartments = repositoryStub<Department>();
    const transactionMappings = repositoryStub<DepartmentPermission>();

    transactionPermissions.findOne!.mockResolvedValue(permission);
    transactionDepartments.find!.mockResolvedValue([{ ...department, id: '1' }]);
    dataSource.transaction.mockImplementation(
      async (callback: (manager: { getRepository: Function }) => unknown) =>
        callback({
          getRepository: (entity: unknown) => {
            if (entity === Permission) return transactionPermissions;
            if (entity === Department) return transactionDepartments;
            return transactionMappings;
          },
        }),
    );

    await expect(
      service.updateDepartments('10', ['1', '999']),
    ).rejects.toMatchObject<Partial<BadRequestException>>({
      response: expect.objectContaining({ departmentIds: ['999'] }),
    });
    expect(transactionMappings.save).not.toHaveBeenCalled();
  });
});
