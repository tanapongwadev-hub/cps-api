/* eslint-disable @typescript-eslint/no-unsafe-assignment,
                  @typescript-eslint/no-unsafe-member-access,
                  @typescript-eslint/no-unsafe-argument,
                  @typescript-eslint/no-unsafe-return,
                  @typescript-eslint/require-await,
                  @typescript-eslint/no-unnecessary-type-assertion */
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { AuditLog } from '../../entities/iam/audit-log.entity';
import { MaterialReceivingPackage } from '../../entities/inventory/material-receiving-package.entity';
import { MaterialReceiving } from '../../entities/inventory/material-receiving.entity';
import { StockBalance } from '../../entities/inventory/stock-balance.entity';
import { StockTransaction } from '../../entities/inventory/stock-transaction.entity';
import { Material } from '../../entities/master/material.entity';
import { Unit } from '../../entities/master/unit.entity';
import { MaterialDisbursementItem } from './material-disbursement-item.entity';
import { MaterialDisbursementPackage } from './material-disbursement-package.entity';
import { MaterialsDisbursementCounter } from '../../entities/inventory/materials-disbursement-counter.entity';
import { MaterialsDisbursement } from './materials-disbursement.entity';
import { MaterialsDisbursementService } from './materials-disbursement.service';

const TODAY = new Date().toISOString().slice(0, 10);

interface RepoMock {
  create: jest.Mock;
  save: jest.Mock;
  find: jest.Mock;
  findOne: jest.Mock;
  count: jest.Mock;
  delete: jest.Mock;
  update: jest.Mock;
  createQueryBuilder: jest.Mock;
}

function makeRepo(overrides: Partial<RepoMock> = {}): RepoMock {
  return {
    create: jest.fn((payload: unknown) => ({ ...(payload as object) })),
    save: jest.fn((entity: unknown) => Promise.resolve(entity)),
    find: jest.fn(() => Promise.resolve([])),
    findOne: jest.fn(() => Promise.resolve(null)),
    count: jest.fn(() => Promise.resolve(0)),
    delete: jest.fn(() => Promise.resolve({ affected: 1 })),
    update: jest.fn(() => Promise.resolve({ affected: 1 })),
    createQueryBuilder: jest.fn(),
    ...overrides,
  };
}

function makeQueryBuilder(result: { one?: unknown; many?: unknown[] }) {
  const builder: Record<string, jest.Mock> = {
    leftJoin: jest.fn(() => builder),
    leftJoinAndSelect: jest.fn(() => builder),
    where: jest.fn(() => builder),
    andWhere: jest.fn(() => builder),
    orderBy: jest.fn(() => builder),
    addOrderBy: jest.fn(() => builder),
    skip: jest.fn(() => builder),
    take: jest.fn(() => builder),
    setLock: jest.fn(() => builder),
    getOne: jest.fn(() => Promise.resolve(result.one ?? null)),
    getMany: jest.fn(() => Promise.resolve(result.many ?? [])),
    getManyAndCount: jest.fn(() =>
      Promise.resolve([result.many ?? [], (result.many ?? []).length]),
    ),
  };
  return builder;
}

function makeManager(repoMap: Record<string, RepoMock>) {
  return {
    getRepository: jest.fn((entity: unknown) => {
      const name = (entity as { name: string }).name;
      const repo = repoMap[name];
      if (!repo) {
        throw new Error(`No mock repo registered for ${name}`);
      }
      return repo;
    }),
    query: jest.fn(() => Promise.resolve([])),
  };
}

function makeDisbursement(overrides: Partial<MaterialsDisbursement> = {}) {
  return {
    id: '20',
    traceId: 'TRC-ISS-20260920-AAAAAAAA',
    disbursementNo: 'DIS-20260920-0001',
    disbursementType: 'production',
    disbursementDate: TODAY,
    status: 'draft',
    reason: null,
    departmentId: null,
    productionOrder: null,
    referenceNo: null,
    requestedBy: null,
    approvedBy: null,
    attachmentUrl: null,
    attachmentName: null,
    remark: null,
    confirmedBy: null,
    confirmedAt: null,
    cancelledBy: null,
    cancelledAt: null,
    cancelReason: null,
    createdBy: '9',
    createdAt: new Date('2026-09-20T00:00:00.000Z'),
    updatedAt: new Date('2026-09-20T00:00:00.000Z'),
    items: [],
    ...overrides,
  } as unknown as MaterialsDisbursement;
}

function makeItem(overrides: Partial<MaterialDisbursementItem> = {}) {
  return {
    id: '30',
    disbursementId: '20',
    materialId: '3',
    requestedQuantity: '25.0000',
    disbursedQuantity: '0.0000',
    createdBy: '9',
    ...overrides,
  } as unknown as MaterialDisbursementItem;
}

function makePackage(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pkg-1',
    materialReceivingId: '10',
    packageNo: 1,
    lotDetailNo: 'CCI-20260901-001-001',
    quantity: '20.0000',
    remainingQuantity: '20.0000',
    status: 'in_stock',
    ...overrides,
  };
}

function setup() {
  const disbursementRepo = makeRepo();
  const itemRepo = makeRepo();
  const packageRecordRepo = makeRepo();
  const counterRepo = makeRepo();
  const receivingPackageRepo = makeRepo();
  const receivingRepo = makeRepo();
  const stockBalanceRepo = makeRepo();
  const stockTransactionRepo = makeRepo();
  const materialRepo = makeRepo();
  const unitRepo = makeRepo();
  const auditLogRepo = makeRepo();

  disbursementRepo.createQueryBuilder.mockReturnValue(
    makeQueryBuilder({ one: makeDisbursement() }),
  );
  receivingPackageRepo.createQueryBuilder.mockReturnValue(
    makeQueryBuilder({ many: [] }),
  );

  const repoMap: Record<string, RepoMock> = {
    [MaterialsDisbursement.name]: disbursementRepo,
    [MaterialDisbursementItem.name]: itemRepo,
    [MaterialDisbursementPackage.name]: packageRecordRepo,
    [MaterialsDisbursementCounter.name]: counterRepo,
    [MaterialReceivingPackage.name]: receivingPackageRepo,
    [MaterialReceiving.name]: receivingRepo,
    [StockBalance.name]: stockBalanceRepo,
    [StockTransaction.name]: stockTransactionRepo,
    [Material.name]: materialRepo,
    [Unit.name]: unitRepo,
    [AuditLog.name]: auditLogRepo,
  };

  const counter = { id: '1', disbursementDate: TODAY, lastNumber: 0 };
  let counterCalls = 0;
  counterRepo.findOne.mockImplementation(() => {
    counterCalls += 1;
    if (counterCalls === 1) return Promise.resolve(null);
    return Promise.resolve({ ...counter, lastNumber: counterCalls - 1 });
  });

  const manager = makeManager(repoMap);
  const dataSource: any = {
    transaction: jest.fn(async (cb: (manager: unknown) => unknown) =>
      cb(manager),
    ),
  };

  const service = new MaterialsDisbursementService(
    disbursementRepo as never,
    itemRepo as never,
    packageRecordRepo as never,
    counterRepo as never,
    receivingPackageRepo as never,
    receivingRepo as never,
    stockBalanceRepo as never,
    materialRepo as never,
    unitRepo as never,
    dataSource,
  );

  return {
    service,
    dataSource,
    manager,
    repoMap,
    repos: {
      disbursementRepo,
      itemRepo,
      packageRecordRepo,
      counterRepo,
      receivingPackageRepo,
      receivingRepo,
      stockBalanceRepo,
      stockTransactionRepo,
      materialRepo,
      unitRepo,
      auditLogRepo,
    },
  };
}

describe('MaterialsDisbursementService', () => {
  describe('create', () => {
    const baseDto = {
      disbursementType: 'production' as const,
      disbursementDate: TODAY,
      items: [{ materialId: '3', requestedQuantity: '25' }],
    };

    it('rejects an empty item list', async () => {
      const { service } = setup();
      await expect(
        service.create({ ...baseDto, items: [] }, '9'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects stock_cut without a reason', async () => {
      const { service } = setup();
      await expect(
        service.create({ ...baseDto, disbursementType: 'stock_cut' }, '9'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a future disbursement date', async () => {
      const { service } = setup();
      const tomorrow = new Date();
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
      await expect(
        service.create(
          { ...baseDto, disbursementDate: tomorrow.toISOString().slice(0, 10) },
          '9',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects non-positive requested quantity', async () => {
      const { service } = setup();
      await expect(
        service.create(
          { ...baseDto, items: [{ materialId: '3', requestedQuantity: '0' }] },
          '9',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('creates a draft with a trace id and writes a CREATE audit event', async () => {
      const { service, repos } = setup();
      repos.materialRepo.findOne.mockResolvedValue({ id: '3', isActive: true });
      repos.disbursementRepo.save.mockImplementation((entity: unknown) => {
        const e = { ...(entity as object) } as MaterialsDisbursement;
        if (!e.id) e.id = '20';
        return Promise.resolve(e);
      });

      await service.create(baseDto, '9');

      const saved = repos.disbursementRepo.save.mock.calls[0][0];
      expect(saved.traceId).toMatch(/^TRC-ISS-/);
      expect(saved.status).toBe('draft');
      expect(repos.itemRepo.save).toHaveBeenCalledTimes(1);
      expect(repos.auditLogRepo.save).toHaveBeenCalledTimes(1);
      const audit = repos.auditLogRepo.save.mock.calls[0][0];
      expect(audit.action).toBe('CREATE');
      expect(audit.targetType).toBe('MATERIALS_DISBURSEMENT');
    });
  });

  describe('confirm — FIFO allocation', () => {
    it('consumes the oldest package first and records one ISSUE movement per package', async () => {
      const { service, repos } = setup();
      const disbursement = makeDisbursement({ status: 'draft' });
      repos.disbursementRepo.findOne.mockResolvedValue(disbursement);
      repos.itemRepo.find.mockResolvedValue([
        makeItem({ requestedQuantity: '25.0000' }),
      ]);
      repos.materialRepo.findOne.mockResolvedValue({ id: '3', unitId: '5' });
      repos.stockBalanceRepo.findOne.mockResolvedValue({
        id: '1',
        materialId: '3',
        quantity: '40.0000',
      });
      repos.receivingRepo.findOne.mockResolvedValue({
        id: '10',
        internalLotNo: 'CCI-20260901-001',
      });

      // Oldest package (pkg-old) should be consumed first, then pkg-new for the remainder.
      const oldPkg = makePackage({
        id: 'pkg-old',
        quantity: '20.0000',
        remainingQuantity: '20.0000',
      });
      const newPkg = makePackage({
        id: 'pkg-new',
        quantity: '20.0000',
        remainingQuantity: '20.0000',
      });
      repos.receivingPackageRepo.createQueryBuilder.mockReturnValue(
        makeQueryBuilder({ many: [oldPkg, newPkg] }),
      );

      await service.confirm('20', '9');

      // 25 requested = 20 (full, oldPkg) + 5 (partial, newPkg)
      expect(repos.stockTransactionRepo.save).toHaveBeenCalledTimes(2);
      const [firstMovement, secondMovement] =
        repos.stockTransactionRepo.save.mock.calls.map(
          (c: unknown[]) => c[0] as any,
        );
      expect(firstMovement.subQrId).toBe('pkg-old');
      expect(firstMovement.quantityOut).toBe('20.0000');
      expect(secondMovement.subQrId).toBe('pkg-new');
      expect(secondMovement.quantityOut).toBe('5.0000');

      // Package allocation records (FIFO order) preserved, never deleted.
      expect(repos.packageRecordRepo.save).toHaveBeenCalledTimes(2);
      const firstAlloc = repos.packageRecordRepo.save.mock.calls[0][0];
      expect(firstAlloc.fifoOrder).toBe(1);
      expect(firstAlloc.packageId).toBe('pkg-old');

      // Fully-consumed package -> issued/0 remaining; partially-consumed -> partial.
      const savedPackages = repos.receivingPackageRepo.save.mock.calls.map(
        (c: unknown[]) => c[0] as any,
      );
      expect(savedPackages.find((p) => p.id === 'pkg-old').status).toBe(
        'issued',
      );
      expect(
        savedPackages.find((p) => p.id === 'pkg-old').remainingQuantity,
      ).toBe('0.0000');
      expect(savedPackages.find((p) => p.id === 'pkg-new').status).toBe(
        'partial',
      );
      expect(
        savedPackages.find((p) => p.id === 'pkg-new').remainingQuantity,
      ).toBe('15.0000');

      // Balance decremented by the total disbursed (25), not per package.
      const savedBalance = repos.stockBalanceRepo.save.mock.calls[0][0];
      expect(savedBalance.quantity).toBe('15.0000');

      const savedDisbursement = repos.disbursementRepo.save.mock.calls[0][0];
      expect(savedDisbursement.status).toBe('confirmed');
    });

    it('throws when available stock is insufficient and writes nothing', async () => {
      const { service, repos } = setup();
      repos.disbursementRepo.findOne.mockResolvedValue(
        makeDisbursement({ status: 'draft' }),
      );
      repos.itemRepo.find.mockResolvedValue([
        makeItem({ requestedQuantity: '100.0000' }),
      ]);
      repos.materialRepo.findOne.mockResolvedValue({ id: '3', unitId: '5' });
      repos.receivingPackageRepo.createQueryBuilder.mockReturnValue(
        makeQueryBuilder({
          many: [makePackage({ remainingQuantity: '20.0000' })],
        }),
      );

      await expect(service.confirm('20', '9')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(repos.stockTransactionRepo.save).not.toHaveBeenCalled();
      expect(repos.stockBalanceRepo.save).not.toHaveBeenCalled();
    });

    it('locks receiving packages and subtracts active reservations per package', async () => {
      const { service, manager, repos } = setup();
      repos.disbursementRepo.findOne.mockResolvedValue(
        makeDisbursement({ status: 'draft' }),
      );
      repos.itemRepo.find.mockResolvedValue([
        makeItem({ requestedQuantity: '10.0000' }),
      ]);
      repos.materialRepo.findOne.mockResolvedValue({ id: '3', unitId: '5' });
      repos.stockBalanceRepo.findOne.mockResolvedValue({
        id: '1',
        materialId: '3',
        quantity: '40.0000',
      });
      repos.receivingRepo.findOne.mockResolvedValue({
        id: '10',
        internalLotNo: 'CCI-20260901-001',
      });

      const oldPkg = makePackage({ id: 'pkg-old' });
      const newPkg = makePackage({ id: 'pkg-new' });
      const packageQuery = makeQueryBuilder({ many: [oldPkg, newPkg] });
      repos.receivingPackageRepo.createQueryBuilder.mockReturnValue(
        packageQuery,
      );
      manager.query.mockResolvedValue([
        { package_id: 'pkg-old', reserved_quantity: '15.0000' },
      ]);

      await service.confirm('20', '9');

      expect(packageQuery.setLock).toHaveBeenCalledWith(
        'pessimistic_write',
        undefined,
        ['pkg'],
      );
      expect(manager.query).toHaveBeenCalledWith(
        expect.stringContaining('production_plan_reservations'),
        [['pkg-old', 'pkg-new']],
      );

      const savedPackages = repos.receivingPackageRepo.save.mock.calls.map(
        (call: unknown[]) => call[0] as any,
      );
      expect(
        savedPackages.find((pkg) => pkg.id === 'pkg-old').remainingQuantity,
      ).toBe('15.0000');
      expect(
        savedPackages.find((pkg) => pkg.id === 'pkg-new').remainingQuantity,
      ).toBe('15.0000');
    });

    it('treats fully reserved package quantity as unavailable', async () => {
      const { service, manager, repos } = setup();
      repos.disbursementRepo.findOne.mockResolvedValue(
        makeDisbursement({ status: 'draft' }),
      );
      repos.itemRepo.find.mockResolvedValue([
        makeItem({ requestedQuantity: '10.0000' }),
      ]);
      repos.receivingPackageRepo.createQueryBuilder.mockReturnValue(
        makeQueryBuilder({
          many: [makePackage({ id: 'pkg-reserved' })],
        }),
      );
      manager.query.mockResolvedValue([
        { package_id: 'pkg-reserved', reserved_quantity: '20.0000' },
      ]);

      await expect(service.confirm('20', '9')).rejects.toThrow(
        'Requested: 10.0000, Available: 0.0000',
      );
      expect(repos.receivingPackageRepo.save).not.toHaveBeenCalled();
      expect(repos.stockTransactionRepo.save).not.toHaveBeenCalled();
    });

    it('rejects confirming a non-draft disbursement', async () => {
      const { service, repos } = setup();
      repos.disbursementRepo.findOne.mockResolvedValue(
        makeDisbursement({ status: 'confirmed' }),
      );
      await expect(service.confirm('20', '9')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('cancel — reversal, not deletion', () => {
    it('reverses a confirmed disbursement: restores packages, writes CANCEL movements, and keeps the original allocation rows (marked reversed)', async () => {
      const { service, repos } = setup();
      const confirmed = makeDisbursement({ status: 'confirmed' });
      repos.disbursementRepo.findOne.mockResolvedValue(confirmed);
      repos.itemRepo.find.mockResolvedValue([
        makeItem({ disbursedQuantity: '20.0000' }),
      ]);
      repos.materialRepo.findOne.mockResolvedValue({ id: '3', unitId: '5' });
      repos.receivingRepo.findOne.mockResolvedValue({
        id: '10',
        internalLotNo: 'CCI-20260901-001',
      });
      const allocation = {
        id: 'alloc-1',
        disbursementItemId: '30',
        packageId: 'pkg-old',
        disbursedQuantity: '20.0000',
        fifoOrder: 1,
        reversedAt: null,
        reversedBy: null,
      };
      repos.packageRecordRepo.find.mockResolvedValue([allocation]);
      repos.receivingPackageRepo.findOne.mockResolvedValue(
        makePackage({
          id: 'pkg-old',
          quantity: '20.0000',
          remainingQuantity: '0.0000',
          status: 'issued',
        }),
      );
      repos.stockBalanceRepo.findOne.mockResolvedValue({
        id: '1',
        materialId: '3',
        quantity: '15.0000',
      });

      await service.cancel('20', { cancelReason: 'wrong material' }, '9');

      // Package restored to its original remaining quantity, back to in_stock.
      const restoredPkg = repos.receivingPackageRepo.save.mock.calls[0][0];
      expect(restoredPkg.remainingQuantity).toBe('20.0000');
      expect(restoredPkg.status).toBe('in_stock');

      // A CANCEL movement was recorded — the original ISSUE movement is never
      // deleted or mutated, only a new reversal row is appended.
      const movement = repos.stockTransactionRepo.save.mock.calls[0][0];
      expect(movement.transactionType).toBe('CANCEL');
      expect(movement.quantityIn).toBe('20.0000');

      // The allocation row itself is preserved (never deleted) — only
      // reversedAt/reversedBy are set, so FIFO trace history stays intact.
      expect(repos.packageRecordRepo.save).toHaveBeenCalledTimes(1);
      const savedAllocation = repos.packageRecordRepo.save.mock.calls[0][0];
      expect(savedAllocation.id).toBe('alloc-1');
      expect(savedAllocation.reversedAt).toBeInstanceOf(Date);
      expect(savedAllocation.reversedBy).toBe('9');
      expect(repos.packageRecordRepo.delete).not.toHaveBeenCalled();

      // The known bug: `before.status` must report the real pre-cancel status
      // ('confirmed'), not the post-mutation 'cancelled' value.
      const audit = repos.auditLogRepo.save.mock.calls[0][0];
      expect(audit.action).toBe('CANCEL');
      expect(audit.beforeData).toEqual({ status: 'confirmed' });
      expect(audit.afterData).toEqual({ status: 'cancelled' });
    });

    it('cancelling a draft records before.status as draft, not confirmed', async () => {
      const { service, repos } = setup();
      repos.disbursementRepo.findOne.mockResolvedValue(
        makeDisbursement({ status: 'draft' }),
      );

      await service.cancel('20', { cancelReason: 'duplicate' }, '9');

      expect(repos.stockTransactionRepo.save).not.toHaveBeenCalled();
      const audit = repos.auditLogRepo.save.mock.calls[0][0];
      expect(audit.beforeData).toEqual({ status: 'draft' });
      expect(audit.afterData).toEqual({ status: 'cancelled' });
    });

    it('blocks cancelling an already-cancelled disbursement (idempotent)', async () => {
      const { service, repos } = setup();
      repos.disbursementRepo.findOne.mockResolvedValue(
        makeDisbursement({ status: 'cancelled' }),
      );
      await expect(
        service.cancel('20', { cancelReason: 'again' }, '9'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('only reverses allocations that have not already been reversed', async () => {
      const { service, repos } = setup();
      repos.disbursementRepo.findOne.mockResolvedValue(
        makeDisbursement({ status: 'confirmed' }),
      );
      repos.itemRepo.find.mockResolvedValue([makeItem()]);
      repos.materialRepo.findOne.mockResolvedValue({ id: '3', unitId: '5' });
      repos.receivingRepo.findOne.mockResolvedValue({
        id: '10',
        internalLotNo: 'CCI-20260901-001',
      });
      repos.receivingPackageRepo.findOne.mockResolvedValue(
        makePackage({ remainingQuantity: '0.0000', status: 'issued' }),
      );
      repos.stockBalanceRepo.findOne.mockResolvedValue({
        id: '1',
        materialId: '3',
        quantity: '15.0000',
      });

      await service.cancel('20', { cancelReason: 'x' }, '9');

      // find() was called scoped to reversedAt IS NULL — assert the query
      // shape rather than relying on the DB to enforce it in this unit test.
      expect(repos.packageRecordRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ disbursementItemId: '30' }),
        }),
      );
    });
  });

  describe('remove — soft cancel, never a hard delete', () => {
    it('deletes (cancels) a draft without a hard DELETE', async () => {
      const { service, repos } = setup();
      repos.disbursementRepo.findOne.mockResolvedValue(
        makeDisbursement({ status: 'draft' }),
      );
      await expect(service.remove('20', '9')).resolves.toBeUndefined();
      expect(repos.disbursementRepo.delete).not.toHaveBeenCalled();
      const saved = repos.disbursementRepo.save.mock.calls[0][0];
      expect(saved.status).toBe('cancelled');
      const audit = repos.auditLogRepo.save.mock.calls[0][0];
      expect(audit.action).toBe('DELETE');
      expect(audit.afterData).toEqual({ status: 'cancelled' });
    });

    it('rejects removing a confirmed disbursement', async () => {
      const { service, repos } = setup();
      repos.disbursementRepo.findOne.mockResolvedValue(
        makeDisbursement({ status: 'confirmed' }),
      );
      await expect(service.remove('20', '9')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('update', () => {
    it('rejects editing a non-draft disbursement', async () => {
      const { service, repos } = setup();
      repos.disbursementRepo.findOne.mockResolvedValue(
        makeDisbursement({ status: 'confirmed' }),
      );
      await expect(
        service.update('20', { reason: 'x' } as never, '9'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('returns NotFound when the disbursement does not exist', async () => {
      const { service, repos } = setup();
      repos.disbursementRepo.findOne.mockResolvedValue(null);
      await expect(
        service.update('999', {} as never, '9'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
