import { BadRequestException, ConflictException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { Action } from '../../entities/iam/action.entity';
import { AuditLog } from '../../entities/iam/audit-log.entity';
import { DepartmentPermission } from '../../entities/iam/department-permission.entity';
import { Department } from '../../entities/iam/department.entity';
import { Menu } from '../../entities/iam/menu.entity';
import { Permission } from '../../entities/iam/permission.entity';
import { computePermissionAccessVersion } from './permission-access-matrix';
import { PermissionsService } from './permissions.service';

type RepositoryStub<T extends object> = Partial<
  Record<keyof Repository<T>, jest.Mock>
>;

function repositoryStub<T extends object>(): RepositoryStub<T> {
  return {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn((value: unknown) => value),
    save: jest.fn(async (value: unknown) => value),
    update: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
}

describe('PermissionsService department restrictions', () => {
  let permissions: RepositoryStub<Permission>;
  let menus: RepositoryStub<Menu>;
  let actions: RepositoryStub<Action>;
  let departments: RepositoryStub<Department>;
  let mappings: RepositoryStub<DepartmentPermission>;
  let dataSource: { transaction: jest.Mock; manager: unknown };
  let service: PermissionsService;

  // Repositories used inside dataSource.transaction(...)
  let txPermissions: RepositoryStub<Permission>;
  let txDepartments: RepositoryStub<Department>;
  let txMappings: RepositoryStub<DepartmentPermission>;
  let txActions: RepositoryStub<Action>;
  let txMenus: RepositoryStub<Menu>;
  let txAudit: RepositoryStub<AuditLog>;
  let txQuery: jest.Mock;

  const permission = {
    id: '10',
    code: 'order.approve',
    menuId: '5',
    isActive: true,
    accessScope: 'ALL',
    action: { code: 'APPROVE' },
  } as unknown as Permission;
  const department = {
    id: '1',
    code: 'WE',
    nameTh: 'แผนก WE',
    nameEn: 'WE Department',
    isActive: true,
  } as Department;

  beforeEach(() => {
    permissions = repositoryStub<Permission>();
    menus = repositoryStub<Menu>();
    actions = repositoryStub<Action>();
    departments = repositoryStub<Department>();
    mappings = repositoryStub<DepartmentPermission>();
    txPermissions = repositoryStub<Permission>();
    txDepartments = repositoryStub<Department>();
    txMappings = repositoryStub<DepartmentPermission>();
    txActions = repositoryStub<Action>();
    txMenus = repositoryStub<Menu>();
    txAudit = repositoryStub<AuditLog>();
    txQuery = jest.fn();
    const manager = {
      query: txQuery,
      getRepository: (entity: unknown) => {
        if (entity === Permission) return txPermissions;
        if (entity === Department) return txDepartments;
        if (entity === Action) return txActions;
        if (entity === Menu) return txMenus;
        if (entity === AuditLog) return txAudit;
        return txMappings;
      },
    };
    dataSource = {
      manager,
      transaction: jest.fn(async (callback: (m: unknown) => unknown) =>
        callback(manager),
      ),
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

  describe('updateDepartments', () => {
    it('stores the DEPARTMENTS scope, toggles mappings and audits under the access lock', async () => {
      const oldMapping = {
        id: '100',
        permissionId: '10',
        departmentId: '1',
        isActive: true,
      } as DepartmentPermission;
      const newDepartment = { ...department, id: '2', code: 'PS' };

      txPermissions.findOne!.mockResolvedValue(permission);
      txPermissions.find!.mockResolvedValue([permission]);
      txDepartments.find!.mockResolvedValue([newDepartment]);
      txMappings.find!.mockResolvedValue([oldMapping]);
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
        service.updateDepartments('10', ['2'], '7'),
      ).resolves.toMatchObject({
        departments: [expect.objectContaining({ id: '2', code: 'PS' })],
      });
      expect(txQuery).toHaveBeenCalledWith(
        expect.stringContaining('pg_advisory_xact_lock'),
        ['iam.permission_access'],
      );
      expect(txPermissions.update).toHaveBeenCalledWith(
        { id: '10' },
        { accessScope: 'DEPARTMENTS' },
      );
      expect(txMappings.save).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ departmentId: '1', isActive: false }),
          expect.objectContaining({ departmentId: '2', isActive: true }),
        ]),
      );
      expect(txAudit.save).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: 'iam.permission.department_scope_changed',
          targetType: 'PERMISSION',
          targetId: '10',
          actorUserId: '7',
        }),
      );
    });

    it('treats an empty list as closed to every department, not open to all', async () => {
      txPermissions.findOne!.mockResolvedValue(permission);
      txPermissions.find!.mockResolvedValue([permission]);
      txMappings.find!.mockResolvedValue([]);
      permissions.findOne!.mockResolvedValue(permission);
      mappings.find!.mockResolvedValue([]);

      await service.updateDepartments('10', []);

      expect(txPermissions.update).toHaveBeenCalledWith(
        { id: '10' },
        { accessScope: 'DEPARTMENTS' },
      );
    });

    it('rejects unknown department IDs without saving mappings', async () => {
      txPermissions.findOne!.mockResolvedValue(permission);
      txDepartments.find!.mockResolvedValue([{ ...department, id: '1' }]);

      await expect(
        service.updateDepartments('10', ['1', '999']),
      ).rejects.toMatchObject<Partial<BadRequestException>>({
        response: expect.objectContaining({ departmentIds: ['999'] }),
      });
      expect(txMappings.save).not.toHaveBeenCalled();
    });
  });

  describe('updateAccess', () => {
    const readPermission = {
      id: '11',
      code: 'order.view',
      menuId: '5',
      isActive: true,
      accessScope: 'ALL',
      action: { code: 'READ' },
    } as unknown as Permission;
    const currentVersion = () =>
      computePermissionAccessVersion([
        { id: '10', accessScope: 'ALL', departmentIds: [] },
        { id: '11', accessScope: 'ALL', departmentIds: [] },
      ]);

    beforeEach(() => {
      txPermissions.find!.mockResolvedValue([permission, readPermission]);
      txMappings.find!.mockResolvedValue([]);
      txDepartments.find!.mockResolvedValue([
        department,
        { ...department, id: '2', code: 'PS' },
      ]);
      txActions.find!.mockResolvedValue([]);
      txMenus.find!.mockResolvedValue([]);
    });

    it('rejects a stale version with 409 and writes nothing', async () => {
      await expect(
        service.updateAccess(
          {
            version: 'sha256:stale',
            reason: 'ปรับสิทธิ์ตามแผนก',
            items: [
              { permissionId: '10', accessScope: 'DEPARTMENTS', departmentIds: ['1'] },
            ],
          },
          '7',
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(txPermissions.update).not.toHaveBeenCalled();
    });

    it('requires a non-blank reason before opening the transaction', async () => {
      await expect(
        service.updateAccess(
          {
            version: currentVersion(),
            reason: '   ',
            items: [
              { permissionId: '10', accessScope: 'DEPARTMENTS', departmentIds: ['1'] },
            ],
          },
          '7',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('rejects department IDs on an ALL scope', async () => {
      await expect(
        service.updateAccess(
          {
            version: currentVersion(),
            reason: 'ปรับสิทธิ์ตามแผนก',
            items: [
              { permissionId: '10', accessScope: 'ALL', departmentIds: ['1'] },
            ],
          },
          '7',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects closing READ for a department that keeps another action of the menu', async () => {
      await expect(
        service.updateAccess(
          {
            version: currentVersion(),
            reason: 'ปรับสิทธิ์ตามแผนก',
            items: [
              { permissionId: '11', accessScope: 'DEPARTMENTS', departmentIds: ['1'] },
            ],
          },
          '7',
        ),
      ).rejects.toMatchObject<Partial<BadRequestException>>({
        response: expect.objectContaining({
          violations: [
            expect.objectContaining({
              departmentId: '2',
              departmentCode: 'PS',
              readPermissionCode: 'order.view',
              permissionCodes: ['order.approve'],
            }),
          ],
        }),
      });
      expect(txPermissions.update).not.toHaveBeenCalled();
    });

    it('applies a consistent change, audits it and skips unchanged items', async () => {
      await service.updateAccess(
        {
          version: currentVersion(),
          reason: 'ปรับสิทธิ์ตามแผนก',
          items: [
            { permissionId: '10', accessScope: 'DEPARTMENTS', departmentIds: ['1'] },
            { permissionId: '11', accessScope: 'DEPARTMENTS', departmentIds: ['1'] },
          ],
        },
        '7',
      );

      expect(txPermissions.update).toHaveBeenCalledTimes(2);
      expect(txAudit.save).toHaveBeenCalledTimes(2);
      expect(txAudit.save).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: 'iam.permission.department_scope_changed',
          reason: 'ปรับสิทธิ์ตามแผนก',
          actorUserId: '7',
        }),
      );

      txPermissions.update!.mockClear();
      txAudit.save!.mockClear();
      await service.updateAccess(
        {
          version: currentVersion(),
          reason: 'ปรับสิทธิ์ตามแผนก',
          items: [{ permissionId: '10', accessScope: 'ALL', departmentIds: [] }],
        },
        '7',
      );
      expect(txPermissions.update).not.toHaveBeenCalled();
      expect(txAudit.save).not.toHaveBeenCalled();
    });
  });
});
