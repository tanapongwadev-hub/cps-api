/* eslint-disable @typescript-eslint/no-unsafe-assignment,
                  @typescript-eslint/no-unsafe-member-access,
                  @typescript-eslint/no-unsafe-call,
                  @typescript-eslint/no-unsafe-argument,
                  @typescript-eslint/require-await,
                  @typescript-eslint/no-unnecessary-type-assertion,
                  @typescript-eslint/restrict-plus-operands */
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { MaterialReceivingLotCounter } from '../../entities/inventory/material-receiving-lot-counter.entity';
import { MaterialReceivingPackage } from '../../entities/inventory/material-receiving-package.entity';
import { MaterialReceiving } from '../../entities/inventory/material-receiving.entity';
import { StockBalance } from '../../entities/inventory/stock-balance.entity';
import { StockTransaction } from '../../entities/inventory/stock-transaction.entity';
import { Material } from '../../entities/master/material.entity';
import { Organization } from '../../entities/master/organization.entity';
import { SupplierMaterial } from '../../entities/master/supplier-material.entity';
import { Supplier } from '../../entities/master/supplier.entity';
import { Unit } from '../../entities/master/unit.entity';
import { MaterialsReceivingService } from './materials-receiving.service';

const TODAY = new Date().toISOString().slice(0, 10);

function tomorrow(): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

interface RepoMock {
  create: jest.Mock;
  save: jest.Mock;
  find: jest.Mock;
  findOne: jest.Mock;
  count: jest.Mock;
  delete: jest.Mock;
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
    createQueryBuilder: jest.fn(),
    ...overrides,
  };
}

function makeQueryBuilder(result: {
  one?: unknown;
  many?: unknown[];
  raw?: unknown[];
}) {
  const builder: Record<string, jest.Mock> = {
    leftJoinAndSelect: jest.fn(() => builder),
    where: jest.fn(() => builder),
    andWhere: jest.fn(() => builder),
    orderBy: jest.fn(() => builder),
    addOrderBy: jest.fn(() => builder),
    skip: jest.fn(() => builder),
    take: jest.fn(() => builder),
    getOne: jest.fn(() => Promise.resolve(result.one ?? null)),
    getMany: jest.fn(() => Promise.resolve(result.many ?? [])),
    getManyAndCount: jest.fn(() =>
      Promise.resolve([result.many ?? [], (result.many ?? []).length]),
    ),
  };
  return builder;
}

/**
 * Fake EntityManager แบบง่าย — ใช้ repositoryMap เพื่อให้ service เรียก
 * getRepository(Entity) แล้วได้ mock repo ตัวเดียวกับที่ inject ผ่าน token
 */
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

function makeReceiving(overrides: Partial<MaterialReceiving> = {}) {
  return {
    id: '10',
    internalLotNo: 'CCI-20260809-001',
    organizationId: '1',
    supplierId: '2',
    materialId: '3',
    unitId: '5',
    receiveQuantity: '1000',
    packingQuantity: 200,
    packageCount: 5,
    supplierLotNo: 'SUP-20260801',
    supplierProductionDate: '2026-08-01',
    receiveDate: TODAY,
    qrCode: 'data:image/png;base64,abc',
    qrPayload: {
      version: '1.0',
      internalLotNo: 'CCI-20260809-001',
      materialCode: 'MAT-A',
      receiveQuantity: '1000',
      supplierLotNo: 'SUP-20260801',
    },
    status: 'draft',
    idempotencyKey: null,
    remark: null,
    confirmedBy: null,
    confirmedAt: null,
    cancelledBy: null,
    cancelledAt: null,
    cancelReason: null,
    createdBy: '9',
    updatedBy: '9',
    createdAt: new Date('2026-08-08T00:00:00.000Z'),
    updatedAt: new Date('2026-08-08T00:00:00.000Z'),
    supplier: { id: '2', code: 'SUP-001', nameTh: 'บริษัท ตัวอย่าง จำกัด' },
    material: { id: '3', code: 'MAT-A', name: 'น้ำมันปาล์ม' },
    unit: { id: '5', code: 'KG', nameTh: 'กิโลกรัม' },
    organization: { id: '1', code: 'CPS', nameTh: 'องค์กร CPS' },
    packages: [],
    ...overrides,
  } as unknown as MaterialReceiving;
}

function makeMaterial(overrides: Partial<Material> = {}) {
  return {
    id: '3',
    code: 'MAT-A',
    name: 'น้ำมันปาล์ม',
    isActive: true,
    packingQuantity: 200,
    unitId: '5',
    ...overrides,
  } as unknown as Material;
}

function makeSupplier(overrides: Partial<Supplier> = {}) {
  return {
    id: '2',
    code: 'SUP-001',
    nameTh: 'บริษัท ตัวอย่าง จำกัด',
    isActive: true,
    ...overrides,
  } as unknown as Supplier;
}

function makeOrganization(overrides: Partial<Organization> = {}) {
  return {
    id: '1',
    code: 'CPS',
    nameTh: 'องค์กร CPS',
    isActive: true,
    ...overrides,
  } as unknown as Organization;
}

function setup() {
  const receivingRepo = makeRepo();
  const packageRepo = makeRepo();
  const stockBalanceRepo = makeRepo();
  const stockTransactionRepo = makeRepo();
  const lotCounterRepo = makeRepo();
  const supplierRepo = makeRepo();
  const materialRepo = makeRepo();
  const unitRepo = makeRepo();
  const supplierMaterialRepo = makeRepo();
  const organizationRepo = makeRepo();

  // Default: findOne ด้วย createQueryBuilder ใช้สำหรับ findOne(id)
  const defaultReceiving = makeReceiving();
  receivingRepo.createQueryBuilder.mockReturnValue(
    makeQueryBuilder({ one: defaultReceiving }),
  );
  packageRepo.find.mockResolvedValue([]);

  const repoMap: Record<string, RepoMock> = {
    [MaterialReceiving.name]: receivingRepo,
    [MaterialReceivingPackage.name]: packageRepo,
    [StockBalance.name]: stockBalanceRepo,
    [StockTransaction.name]: stockTransactionRepo,
    [MaterialReceivingLotCounter.name]: lotCounterRepo,
    [Supplier.name]: supplierRepo,
    [Material.name]: materialRepo,
    [Unit.name]: unitRepo,
    [SupplierMaterial.name]: supplierMaterialRepo,
    [Organization.name]: organizationRepo,
  };

  // transaction(callback) — เรียก callback ด้วย manager ที่มี repo map เดียวกัน
  const dataSource: any = {
    transaction: jest.fn(async (cb: (manager: unknown) => unknown) =>
      cb(makeManager(repoMap)),
    ),
    getRepository: jest.fn((entity: unknown) => {
      const name = (entity as { name: string }).name;
      return repoMap[name];
    }),
  };

  // Lot counter allocation needs the second findOne (after INSERT) to return a counter.
  // chain findOne: first call -> null, subsequent -> counter
  const lotCounter = {
    id: '1',
    lotDate: TODAY,
    lastNumber: 0,
  };
  let lotCounterCalls = 0;
  lotCounterRepo.findOne.mockImplementation(() => {
    lotCounterCalls += 1;
    if (lotCounterCalls === 1) {
      return Promise.resolve(null);
    }
    return Promise.resolve({ ...lotCounter, lastNumber: lotCounterCalls - 1 });
  });

  const moduleRef: TestingModule = {
    get: jest.fn(),
  } as unknown as TestingModule;

  const service = new MaterialsReceivingService(
    receivingRepo as never,
    packageRepo as never,
    stockBalanceRepo as never,
    stockTransactionRepo as never,
    lotCounterRepo as never,
    supplierRepo as never,
    materialRepo as never,
    unitRepo as never,
    dataSource,
  );

  return {
    service,
    moduleRef,
    dataSource,
    repos: {
      receivingRepo,
      packageRepo,
      stockBalanceRepo,
      stockTransactionRepo,
      lotCounterRepo,
      supplierRepo,
      materialRepo,
      unitRepo,
      supplierMaterialRepo,
      organizationRepo,
    },
  };
}

describe('MaterialsReceivingService', () => {
  describe('onApplicationBootstrap', () => {
    it('throws when default organization does not exist', async () => {
      const { service, dataSource } = setup();
      dataSource.getRepository(Organization).findOne.mockResolvedValue(null);
      await expect(service.onApplicationBootstrap()).rejects.toThrow(
        /Default organization/,
      );
    });

    it('throws when default organization is inactive', async () => {
      const { service, dataSource } = setup();
      dataSource
        .getRepository(Organization)
        .findOne.mockResolvedValue(makeOrganization({ isActive: false }));
      await expect(service.onApplicationBootstrap()).rejects.toThrow(
        /inactive/,
      );
    });

    it('resolves when default organization is active', async () => {
      const { service, dataSource } = setup();
      dataSource
        .getRepository(Organization)
        .findOne.mockResolvedValue(makeOrganization());
      await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
    });
  });

  describe('create', () => {
    const baseDto = {
      materialId: '3',
      supplierId: '2',
      receiveQuantity: '1000',
      supplierProductionDate: '2026-08-01',
      receiveDate: TODAY,
    };

    it('rejects future receiveDate', async () => {
      const { service } = setup();
      await expect(
        service.create({ ...baseDto, receiveDate: tomorrow() }, '9'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects zero or negative receiveQuantity', async () => {
      const { service } = setup();
      await expect(
        service.create({ ...baseDto, receiveQuantity: '0' }, '9'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects when material is inactive', async () => {
      const { service, dataSource } = setup();
      // skip the manager path; instead mock the repo on the manager by using transaction
      dataSource.transaction.mockImplementationOnce(
        async (cb: (m: unknown) => unknown) =>
          cb(
            makeManager({
              [MaterialReceiving.name]: makeRepo(),
              [Material.name]: makeRepo({
                findOne: jest
                  .fn()
                  .mockResolvedValue(makeMaterial({ isActive: false })),
              }),
              [Supplier.name]: makeRepo({
                findOne: jest.fn().mockResolvedValue(makeSupplier()),
              }),
              [SupplierMaterial.name]: makeRepo({
                findOne: jest.fn().mockResolvedValue({ id: '99' }),
              }),
              [Organization.name]: makeRepo({
                findOne: jest.fn().mockResolvedValue(makeOrganization()),
              }),
              [MaterialReceivingLotCounter.name]: makeRepo(),
              [MaterialReceivingPackage.name]: makeRepo(),
            }),
          ),
      );
      await expect(
        service.create(baseDto as never, '9'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects when supplier is not linked to material', async () => {
      const { service, dataSource } = setup();
      dataSource.transaction.mockImplementationOnce(
        async (cb: (m: unknown) => unknown) =>
          cb(
            makeManager({
              [MaterialReceiving.name]: makeRepo(),
              [Material.name]: makeRepo({
                findOne: jest.fn().mockResolvedValue(makeMaterial()),
              }),
              [Supplier.name]: makeRepo({
                findOne: jest.fn().mockResolvedValue(makeSupplier()),
              }),
              [SupplierMaterial.name]: makeRepo({
                findOne: jest.fn().mockResolvedValue(null),
              }),
            }),
          ),
      );
      await expect(
        service.create(baseDto as never, '9'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects when material has no packing quantity and no override', async () => {
      const { service, dataSource } = setup();
      dataSource.transaction.mockImplementationOnce(
        async (cb: (m: unknown) => unknown) =>
          cb(
            makeManager({
              [MaterialReceiving.name]: makeRepo(),
              [Material.name]: makeRepo({
                findOne: jest
                  .fn()
                  .mockResolvedValue(makeMaterial({ packingQuantity: null })),
              }),
              [Supplier.name]: makeRepo({
                findOne: jest.fn().mockResolvedValue(makeSupplier()),
              }),
              [SupplierMaterial.name]: makeRepo({
                findOne: jest.fn().mockResolvedValue({ id: '99' }),
              }),
            }),
          ),
      );
      await expect(
        service.create(baseDto as never, '9'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('builds 5 packages of 200 each when receiveQuantity=1000 and packing=200', async () => {
      const { service, dataSource, repos } = setup();
      const savedPackages: unknown[] = [];
      repos.packageRepo.save.mockImplementation((rows: unknown) => {
        savedPackages.push(...((rows as unknown[]) ?? []));
        return Promise.resolve(rows);
      });
      // capture receivingRepository.save to return the saved receiving
      repos.receivingRepo.save.mockImplementation((entity: unknown) => {
        const e = { ...(entity as object) } as MaterialReceiving;
        if (!e.id) e.id = '10';
        return Promise.resolve(e);
      });
      dataSource.transaction.mockImplementationOnce(
        async (cb: (m: unknown) => unknown) =>
          cb(
            makeManager({
              [MaterialReceiving.name]: repos.receivingRepo,
              [MaterialReceivingPackage.name]: repos.packageRepo,
              [MaterialReceivingLotCounter.name]: repos.lotCounterRepo,
              [Material.name]: repos.materialRepo,
              [Supplier.name]: repos.supplierRepo,
              [SupplierMaterial.name]: repos.supplierMaterialRepo,
              [Unit.name]: repos.unitRepo,
              [Organization.name]: repos.organizationRepo,
            }),
          ),
      );
      repos.materialRepo.findOne.mockResolvedValue(makeMaterial());
      repos.supplierRepo.findOne.mockResolvedValue(makeSupplier());
      repos.supplierMaterialRepo.findOne.mockResolvedValue({
        id: '99',
      });
      repos.organizationRepo.findOne.mockResolvedValue(makeOrganization());

      const result = await service.create(baseDto, '9');

      expect(result).toBeDefined();
      // packageCount = CEIL(1000/200) = 5
      const receivingSaved = repos.receivingRepo.save.mock.calls[0][0];
      expect(receivingSaved.packageCount).toBe(5);
      expect(receivingSaved.packingQuantity).toBe(200);
      expect(receivingSaved.internalLotNo).toMatch(
        new RegExp(`^CCI-${TODAY.replace(/-/g, '')}-\\d{3}$`),
      );
      expect(receivingSaved.supplierLotNo).toBe('SUP-20260801');
      expect(savedPackages).toHaveLength(5);
      const total = savedPackages.reduce(
        (sum, pkg: { quantity: string }) => sum + Number(pkg.quantity),
        0,
      );
      expect(total).toBe(1000);
      // 4 full + 1 with remainder — but 1000/200 = 5 exactly จึงทุกใบเป็น 200
      for (const pkg of savedPackages as { quantity: string }[]) {
        expect(Number(pkg.quantity)).toBe(200);
      }
    });

    it('produces a final package with remainder when quantity is not divisible', async () => {
      const { service, dataSource, repos } = setup();
      const savedPackages: unknown[] = [];
      repos.packageRepo.save.mockImplementation((rows: unknown) => {
        savedPackages.push(...((rows as unknown[]) ?? []));
        return Promise.resolve(rows);
      });
      repos.receivingRepo.save.mockImplementation((entity: unknown) => {
        const e = { ...(entity as object) } as MaterialReceiving;
        if (!e.id) e.id = '11';
        return Promise.resolve(e);
      });
      dataSource.transaction.mockImplementationOnce(
        async (cb: (m: unknown) => unknown) =>
          cb(
            makeManager({
              [MaterialReceiving.name]: repos.receivingRepo,
              [MaterialReceivingPackage.name]: repos.packageRepo,
              [MaterialReceivingLotCounter.name]: repos.lotCounterRepo,
              [Material.name]: repos.materialRepo,
              [Supplier.name]: repos.supplierRepo,
              [SupplierMaterial.name]: repos.supplierMaterialRepo,
              [Organization.name]: repos.organizationRepo,
            }),
          ),
      );
      repos.materialRepo.findOne.mockResolvedValue(makeMaterial());
      repos.supplierRepo.findOne.mockResolvedValue(makeSupplier());
      repos.supplierMaterialRepo.findOne.mockResolvedValue({
        id: '99',
      });
      repos.organizationRepo.findOne.mockResolvedValue(makeOrganization());

      await service.create({ ...baseDto, receiveQuantity: '1050' }, '9');

      // 1050 / 200 = 5.25 -> 6 packages
      expect(savedPackages).toHaveLength(6);
      const total = savedPackages.reduce(
        (sum, pkg: { quantity: string }) => sum + Number(pkg.quantity),
        0,
      );
      expect(total).toBe(1050);
      const last = (savedPackages as { quantity: string }[]).at(-1)!;
      expect(Number(last.quantity)).toBe(50);
    });

    it('returns existing receiving when idempotencyKey matches', async () => {
      const { service, dataSource, repos } = setup();
      const existing = makeReceiving({
        idempotencyKey: 'idem-1234567',
        internalLotNo: 'CCI-20260809-001',
      });
      repos.receivingRepo.findOne.mockResolvedValue(existing);
      dataSource.transaction.mockImplementationOnce(
        async (cb: (m: unknown) => unknown) =>
          cb(makeManager({ [MaterialReceiving.name]: repos.receivingRepo })),
      );
      const result = await service.create(
        { ...baseDto, idempotencyKey: 'idem-1234567' },
        '9',
      );
      expect(result.id).toBe('10');
    });
  });

  describe('update', () => {
    it('rejects update of confirmed receiving', async () => {
      const { service, dataSource, repos } = setup();
      const draft = makeReceiving({ status: 'confirmed' });
      repos.receivingRepo.findOne.mockResolvedValue(draft);
      dataSource.transaction.mockImplementationOnce(
        async (cb: (m: unknown) => unknown) =>
          cb(
            makeManager({
              [MaterialReceiving.name]: repos.receivingRepo,
              [Material.name]: repos.materialRepo,
            }),
          ),
      );
      await expect(
        service.update('10', { updatedAt: new Date().toISOString() }, '9'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects when optimistic concurrency token is stale', async () => {
      const { service, dataSource, repos } = setup();
      const draft = makeReceiving({
        updatedAt: new Date('2026-08-08T01:00:00.000Z'),
      });
      repos.receivingRepo.findOne.mockResolvedValue(draft);
      dataSource.transaction.mockImplementationOnce(
        async (cb: (m: unknown) => unknown) =>
          cb(
            makeManager({
              [MaterialReceiving.name]: repos.receivingRepo,
              [Material.name]: repos.materialRepo,
            }),
          ),
      );
      await expect(
        service.update('10', { updatedAt: '2026-08-08T00:00:00.000Z' }, '9'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('returns NotFound when receiving does not exist', async () => {
      const { service, dataSource, repos } = setup();
      repos.receivingRepo.findOne.mockResolvedValue(null);
      dataSource.transaction.mockImplementationOnce(
        async (cb: (m: unknown) => unknown) =>
          cb(makeManager({ [MaterialReceiving.name]: repos.receivingRepo })),
      );
      await expect(
        service.update('99', { updatedAt: new Date().toISOString() }, '9'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('remove', () => {
    it('rejects delete of confirmed receiving', async () => {
      const { service, dataSource, repos } = setup();
      repos.receivingRepo.findOne.mockResolvedValue(
        makeReceiving({ status: 'confirmed' }),
      );
      dataSource.transaction.mockImplementationOnce(
        async (cb: (m: unknown) => unknown) =>
          cb(makeManager({ [MaterialReceiving.name]: repos.receivingRepo })),
      );
      await expect(service.remove('10')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('deletes a draft receiving', async () => {
      const { service, dataSource, repos } = setup();
      repos.receivingRepo.findOne.mockResolvedValue(
        makeReceiving({ status: 'draft' }),
      );
      dataSource.transaction.mockImplementationOnce(
        async (cb: (m: unknown) => unknown) =>
          cb(makeManager({ [MaterialReceiving.name]: repos.receivingRepo })),
      );
      await expect(service.remove('10')).resolves.toBeUndefined();
    });
  });

  describe('confirm', () => {
    it('creates stock transaction and updates balance when confirming a draft', async () => {
      const { service, dataSource, repos } = setup();
      const draft = makeReceiving({
        id: '10',
        materialId: '3',
        receiveQuantity: '1000',
        status: 'draft',
      });
      repos.receivingRepo.findOne.mockResolvedValue(draft);
      // existing balance
      const balance = {
        id: '1',
        materialId: '3',
        quantity: '500',
        lastMovementAt: null,
      };
      repos.stockBalanceRepo.findOne.mockResolvedValue(balance);
      dataSource.transaction.mockImplementationOnce(
        async (cb: (m: unknown) => unknown) =>
          cb(
            makeManager({
              [MaterialReceiving.name]: repos.receivingRepo,
              [StockBalance.name]: repos.stockBalanceRepo,
              [StockTransaction.name]: repos.stockTransactionRepo,
            }),
          ),
      );
      await service.confirm('10', '9');

      expect(repos.stockBalanceRepo.save).toHaveBeenCalled();
      const savedBalance = repos.stockBalanceRepo.save.mock.calls[0][0];
      expect(savedBalance.quantity).toBe('1500.0000');

      expect(repos.stockTransactionRepo.save).toHaveBeenCalled();
      const txn = repos.stockTransactionRepo.save.mock.calls[0][0];
      expect(txn.transactionType).toBe('RECEIVE');
      expect(txn.quantityIn).toBe('1000.0000');
      expect(txn.quantityBefore).toBe('500.0000');
      expect(txn.quantityAfter).toBe('1500.0000');
      expect(txn.referenceLotNo).toBe('CCI-20260809-001');

      const savedReceiving = repos.receivingRepo.save.mock.calls[0][0];
      expect(savedReceiving.status).toBe('confirmed');
    });

    it('rejects confirm of confirmed receiving', async () => {
      const { service, dataSource, repos } = setup();
      repos.receivingRepo.findOne.mockResolvedValue(
        makeReceiving({ status: 'confirmed' }),
      );
      dataSource.transaction.mockImplementationOnce(
        async (cb: (m: unknown) => unknown) =>
          cb(makeManager({ [MaterialReceiving.name]: repos.receivingRepo })),
      );
      await expect(service.confirm('10', '9')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('cancel', () => {
    it('rejects cancel of already-cancelled receiving', async () => {
      const { service, dataSource, repos } = setup();
      repos.receivingRepo.findOne.mockResolvedValue(
        makeReceiving({ status: 'cancelled' }),
      );
      dataSource.transaction.mockImplementationOnce(
        async (cb: (m: unknown) => unknown) =>
          cb(makeManager({ [MaterialReceiving.name]: repos.receivingRepo })),
      );
      await expect(
        service.cancel('10', { cancelReason: 'wrong' }, '9'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('reverses stock when cancelling a confirmed receiving', async () => {
      const { service, dataSource, repos } = setup();
      const confirmed = makeReceiving({
        id: '10',
        materialId: '3',
        receiveQuantity: '1000',
        status: 'confirmed',
      });
      repos.receivingRepo.findOne.mockResolvedValue(confirmed);
      const balance = {
        id: '1',
        materialId: '3',
        quantity: '1500',
        lastMovementAt: null,
      };
      repos.stockBalanceRepo.findOne.mockResolvedValue(balance);
      dataSource.transaction.mockImplementationOnce(
        async (cb: (m: unknown) => unknown) =>
          cb(
            makeManager({
              [MaterialReceiving.name]: repos.receivingRepo,
              [StockBalance.name]: repos.stockBalanceRepo,
              [StockTransaction.name]: repos.stockTransactionRepo,
            }),
          ),
      );
      await service.cancel('10', { cancelReason: '  wrong supplier  ' }, '9');

      const savedBalance = repos.stockBalanceRepo.save.mock.calls[0][0];
      expect(savedBalance.quantity).toBe('500.0000');

      const txn = repos.stockTransactionRepo.save.mock.calls[0][0];
      expect(txn.transactionType).toBe('ADJUST');
      expect(txn.quantityOut).toBe('1000.0000');
      expect(txn.quantityAfter).toBe('500.0000');

      const savedReceiving = repos.receivingRepo.save.mock.calls[0][0];
      expect(savedReceiving.status).toBe('cancelled');
      expect(savedReceiving.cancelReason).toBe('wrong supplier');
    });

    it('cancels a draft without touching stock', async () => {
      const { service, dataSource, repos } = setup();
      repos.receivingRepo.findOne.mockResolvedValue(
        makeReceiving({ status: 'draft' }),
      );
      dataSource.transaction.mockImplementationOnce(
        async (cb: (m: unknown) => unknown) =>
          cb(makeManager({ [MaterialReceiving.name]: repos.receivingRepo })),
      );
      await service.cancel('10', { cancelReason: 'duplicate entry' }, '9');
      expect(repos.stockBalanceRepo.save).not.toHaveBeenCalled();
      expect(repos.stockTransactionRepo.save).not.toHaveBeenCalled();
      const savedReceiving = repos.receivingRepo.save.mock.calls[0][0];
      expect(savedReceiving.status).toBe('cancelled');
    });
  });

  describe('findByInternalLotNo', () => {
    it('returns the matching receiving for QR scan', async () => {
      const { service, repos } = setup();
      const receiving = makeReceiving();
      repos.receivingRepo.findOne.mockResolvedValue(receiving);
      const result = await service.findByInternalLotNo('CCI-20260809-001');
      expect(result?.id).toBe('10');
    });

    it('returns null when no receiving matches', async () => {
      const { service, repos } = setup();
      repos.receivingRepo.findOne.mockResolvedValue(null);
      const result = await service.findByInternalLotNo('CCI-20999999-999');
      expect(result).toBeNull();
    });
  });

  describe('package count math', () => {
    it('CEIL behaviour — 100/3 yields 34', () => {
      // Use the public service to exercise the private method indirectly via create
      // 100 / 3 = 33.33 -> 34
      // We assert via service path: receiving.packingQuantity = 3, receiveQuantity = 100
      const { service, dataSource, repos } = setup();
      let savedPackages: unknown[] = [];
      repos.packageRepo.save.mockImplementation((rows: unknown) => {
        savedPackages = [...savedPackages, ...((rows as unknown[]) ?? [])];
        return Promise.resolve(rows);
      });
      repos.receivingRepo.save.mockImplementation((entity: unknown) => {
        const e = { ...(entity as object) } as MaterialReceiving;
        if (!e.id) e.id = '12';
        return Promise.resolve(e);
      });
      dataSource.transaction.mockImplementationOnce(
        async (cb: (m: unknown) => unknown) =>
          cb(
            makeManager({
              [MaterialReceiving.name]: repos.receivingRepo,
              [MaterialReceivingPackage.name]: repos.packageRepo,
              [MaterialReceivingLotCounter.name]: repos.lotCounterRepo,
              [Material.name]: repos.materialRepo,
              [Supplier.name]: repos.supplierRepo,
              [SupplierMaterial.name]: repos.supplierMaterialRepo,
              [Organization.name]: repos.organizationRepo,
            }),
          ),
      );
      repos.materialRepo.findOne.mockResolvedValue(
        makeMaterial({ packingQuantity: 3 }),
      );
      repos.supplierRepo.findOne.mockResolvedValue(makeSupplier());
      repos.supplierMaterialRepo.findOne.mockResolvedValue({
        id: '99',
      });
      repos.organizationRepo.findOne.mockResolvedValue(makeOrganization());

      return service
        .create(
          {
            materialId: '3',
            supplierId: '2',
            receiveQuantity: '100',
            supplierProductionDate: '2026-08-01',
            receiveDate: TODAY,
          },
          '9',
        )
        .then(() => {
          expect(savedPackages).toHaveLength(34);
          const total = savedPackages.reduce(
            (s, p: { quantity: string }) => s + Number(p.quantity),
            0,
          );
          expect(total).toBe(100);
        });
    });
  });
});
