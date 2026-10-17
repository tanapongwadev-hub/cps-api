import { BadRequestException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { Action } from '../../entities/iam/action.entity';
import { AuditLog } from '../../entities/iam/audit-log.entity';
import { Role } from '../../entities/iam/role.entity';
import { RoleAction } from '../../entities/iam/role-action.entity';
import { UserDepartmentRole } from '../../entities/iam/user-department-role.entity';
import { RolesService } from './roles.service';

type Stub = Record<string, jest.Mock>;

function stub(): Stub {
  return {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn(),
    create: jest.fn((value: unknown) => value),
    save: jest.fn(async (value: unknown) => value),
  };
}

describe('RolesService.updateActions', () => {
  let txRoles: Stub;
  let txActions: Stub;
  let txRoleActions: Stub;
  let txAudit: Stub;
  let dataSource: { transaction: jest.Mock };
  let service: RolesService;

  const userRole = { id: '3', code: 'USER' } as Role;
  const read = { id: '20', code: 'READ', isActive: true } as Action;
  const create = { id: '21', code: 'CREATE', isActive: true } as Action;

  beforeEach(() => {
    txRoles = stub();
    txActions = stub();
    txRoleActions = stub();
    txAudit = stub();
    const manager = {
      query: jest.fn(),
      getRepository: (entity: unknown) => {
        if (entity === Role) return txRoles;
        if (entity === Action) return txActions;
        if (entity === RoleAction) return txRoleActions;
        if (entity === AuditLog) return txAudit;
        throw new Error('unexpected repository');
      },
    };
    dataSource = {
      transaction: jest.fn(async (callback: (m: unknown) => unknown) =>
        callback(manager),
      ),
    };
    service = new RolesService(
      stub() as unknown as Repository<Role>,
      stub() as unknown as Repository<RoleAction>,
      stub() as unknown as Repository<UserDepartmentRole>,
      dataSource as unknown as DataSource,
    );
    jest
      .spyOn(service, 'findAll')
      .mockResolvedValue({ items: [], meta: {} } as never);
    txRoles.find.mockResolvedValue([userRole]);
  });

  it('requires a reason before opening the transaction', async () => {
    await expect(
      service.updateActions(
        { reason: ' ', items: [{ roleId: '3', actionCodes: ['READ'] }] },
        '7',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('refuses to edit SUPER_ADMIN', async () => {
    txRoles.find.mockResolvedValue([{ id: '1', code: 'SUPER_ADMIN' }]);
    await expect(
      service.updateActions(
        { reason: 'x', items: [{ roleId: '1', actionCodes: ['READ'] }] },
        '7',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(txRoleActions.save).not.toHaveBeenCalled();
  });

  it('rejects unknown action codes instead of dropping them', async () => {
    txActions.find.mockResolvedValue([read]);
    await expect(
      service.updateActions(
        { reason: 'x', items: [{ roleId: '3', actionCodes: ['READ', 'FLY'] }] },
        '7',
      ),
    ).rejects.toMatchObject<Partial<BadRequestException>>({
      response: expect.objectContaining({ actionCodes: ['FLY'] }),
    });
  });

  it('adds and removes actions and audits the change', async () => {
    txActions.find.mockResolvedValue([read, create]);
    txRoleActions.find.mockResolvedValue([
      { roleId: '3', actionId: '20', isActive: true, action: read },
      { roleId: '3', actionId: '22', isActive: true, action: { code: 'UPDATE' } },
    ]);

    await expect(
      service.updateActions(
        { reason: 'ปรับ role', items: [{ roleId: '3', actionCodes: ['read', 'CREATE'] }] },
        '7',
      ),
    ).resolves.toMatchObject({ changed: 1 });

    expect(txRoleActions.save).toHaveBeenCalledWith(
      expect.objectContaining({ actionId: '22', isActive: false }),
    );
    expect(txRoleActions.save).toHaveBeenCalledWith(
      expect.objectContaining({ actionId: '21', isActive: true }),
    );
    expect(txAudit.save).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: 'iam.role.actions_changed',
        targetType: 'ROLE',
        targetId: '3',
        reason: 'ปรับ role',
        beforeData: { code: 'USER', actionCodes: ['READ', 'UPDATE'] },
        afterData: { code: 'USER', actionCodes: ['CREATE', 'READ'] },
      }),
    );
  });

  it('skips roles whose action set did not change', async () => {
    txActions.find.mockResolvedValue([read]);
    txRoleActions.find.mockResolvedValue([
      { roleId: '3', actionId: '20', isActive: true, action: read },
    ]);

    await expect(
      service.updateActions(
        { reason: 'x', items: [{ roleId: '3', actionCodes: ['READ'] }] },
        '7',
      ),
    ).resolves.toMatchObject({ changed: 0 });
    expect(txRoleActions.save).not.toHaveBeenCalled();
    expect(txAudit.save).not.toHaveBeenCalled();
  });
});
