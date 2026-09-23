/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { MaterialReceivingPackage } from '../../entities/inventory/material-receiving-package.entity';
import { StockBalance } from '../../entities/inventory/stock-balance.entity';
import { StockTransaction } from '../../entities/inventory/stock-transaction.entity';
import { Material } from '../../entities/master/material.entity';
import { MaterialDisbursementItem } from '../materials-disbursement/material-disbursement-item.entity';
import { MaterialDisbursementPackage } from '../materials-disbursement/material-disbursement-package.entity';
import { MaterialsDisbursement } from '../materials-disbursement/materials-disbursement.entity';
import { MaterialsDisbursementCounter } from '../../entities/inventory/materials-disbursement-counter.entity';
import { ProductionPlan } from '../production-plans/production-plan.entity';
import { ProductionPlanReservation } from '../production-plans/production-plan-reservation.entity';
import { AuditLog } from '../../entities/iam/audit-log.entity';
import { MaterialJobOrder } from './material-job-order.entity';
import { MaterialJobOrdersService } from './material-job-orders.service';

function makeQueryBuilder(result: { one?: unknown; many?: unknown[] } = {}) {
  const builder: Record<string, jest.Mock> = {
    innerJoin: jest.fn(() => builder),
    innerJoinAndSelect: jest.fn(() => builder),
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
    getCount: jest.fn(() => Promise.resolve((result.many ?? []).length)),
  };
  return builder;
}

function makeRepo() {
  return {
    create: jest.fn((value: unknown) => ({ ...(value as object) })),
    save: jest.fn((value: unknown) => Promise.resolve(value)),
    find: jest.fn(() => Promise.resolve([])),
    findOne: jest.fn(() => Promise.resolve(null)),
    createQueryBuilder: jest.fn(() => makeQueryBuilder()),
  };
}

function setup() {
  const entities = [
    MaterialJobOrder,
    ProductionPlan,
    ProductionPlanReservation,
    MaterialReceivingPackage,
    Material,
    StockBalance,
    MaterialsDisbursement,
    MaterialDisbursementItem,
    MaterialDisbursementPackage,
    MaterialsDisbursementCounter,
    StockTransaction,
    AuditLog,
  ];
  const repos = Object.fromEntries(
    entities.map((entity) => [entity.name, makeRepo()]),
  ) as Record<string, ReturnType<typeof makeRepo>>;
  const manager = {
    getRepository: jest.fn((entity: { name: string }) => repos[entity.name]),
    query: jest.fn(() => Promise.resolve([])),
  };
  const dataSource = {
    getRepository: jest.fn((entity: { name: string }) => repos[entity.name]),
    transaction: jest.fn((callback: (value: typeof manager) => unknown) =>
      callback(manager),
    ),
    query: jest.fn(() => Promise.resolve([])),
  };
  const service = new MaterialJobOrdersService(
    repos[MaterialJobOrder.name] as never,
    dataSource as never,
  );
  return { service, repos, manager, dataSource };
}

function makeJobOrder(
  overrides: Partial<MaterialJobOrder> = {},
): MaterialJobOrder {
  return {
    id: 'jo-1',
    code: 'JO-20260923-0001',
    productionPlanId: 'plan-1',
    status: 'READY_TO_ISSUE',
    version: 1,
    printCount: 0,
    lastPrintedBy: null,
    lastPrintedAt: null,
    completedBy: null,
    completedAt: null,
    cancelledBy: null,
    cancelledAt: null,
    cancelReason: null,
    createdBy: 'user-1',
    createdAt: new Date('2026-09-22T00:00:00Z'),
    updatedAt: new Date('2026-09-22T00:00:00Z'),
    ...overrides,
  } as MaterialJobOrder;
}

function makeReservation(overrides: Record<string, unknown> = {}) {
  return {
    id: 'reservation-1',
    productionPlanLineId: 'line-1',
    materialReceivingPackageId: 'pkg-1',
    reservedQuantity: '10.0000',
    issuedQuantity: '0.0000',
    pickedAt: new Date('2026-09-22T01:00:00Z'),
    pickedBy: 'picker-1',
    releasedAt: null,
    releaseType: null,
    releasedBy: null,
    materialReceivingPackage: {
      id: 'pkg-1',
      lotDetailNo: 'CCI-26J07-001-001',
      packageNo: 1,
      remainingQuantity: '10.0000',
      status: 'in_stock',
      materialReceiving: {
        id: 'receiving-1',
        materialId: 'material-1',
        internalLotNo: 'CCI-26J07-001',
        supplierLotNo: '26J07',
      },
    },
    ...overrides,
  };
}

describe('MaterialJobOrdersService', () => {
  describe('issue', () => {
    it('fully issues a reservation, releases it, and completes the Plan + Job Order', async () => {
      const { service, repos } = setup();
      const jobOrder = makeJobOrder();
      const plan = {
        id: 'plan-1',
        code: 'PP-202609-0001',
        status: 'APPROVED',
        lines: [],
      };
      const reservation = makeReservation();

      repos[MaterialJobOrder.name].findOne.mockResolvedValue(jobOrder);
      repos[ProductionPlan.name].findOne.mockResolvedValue(plan);
      repos[ProductionPlanReservation.name].createQueryBuilder
        .mockReturnValueOnce(makeQueryBuilder({ many: [reservation] }))
        .mockReturnValueOnce(makeQueryBuilder({ many: [] })); // remaining outstanding
      repos[MaterialReceivingPackage.name].createQueryBuilder.mockReturnValue(
        makeQueryBuilder({ many: [reservation.materialReceivingPackage] }),
      );
      repos[MaterialsDisbursementCounter.name].findOne.mockResolvedValue({
        id: 'counter-1',
        disbursementDate: new Date().toISOString().slice(0, 10),
        lastNumber: 0,
      });
      repos[MaterialsDisbursement.name].save.mockImplementation((value) =>
        Promise.resolve({ ...value, id: 'disbursement-1' }),
      );
      repos[MaterialDisbursementItem.name].save.mockImplementation((value) =>
        Promise.resolve({ ...value, id: 'item-1' }),
      );
      repos[StockBalance.name].findOne.mockResolvedValue({
        id: 'balance-1',
        materialId: 'material-1',
        quantity: '10.0000',
      });
      repos[Material.name].find.mockResolvedValue([
        { id: 'material-1', unitId: 'unit-1' },
      ]);

      await service.issue(
        'jo-1',
        {
          version: 1,
          items: [{ reservationId: 'reservation-1', quantity: '10.0000' }],
        },
        'issuer-1',
      );

      expect(reservation.releasedAt).toBeInstanceOf(Date);
      expect(reservation.releaseType).toBe('ISSUED');
      expect(reservation.issuedQuantity).toBe('10.0000');
      expect(jobOrder.status).toBe('ISSUED');
      expect(plan.status).toBe('ISSUED');
      expect(
        repos[MaterialDisbursementPackage.name].save.mock.calls[0][0]
          .productionPlanReservationId,
      ).toBe('reservation-1');
      // Never re-runs FIFO — only the reservation's own package is touched.
      expect(
        repos[MaterialReceivingPackage.name].createQueryBuilder,
      ).toHaveBeenCalledTimes(1);
    });

    it('issues when the freshly locked package has no eager receiving relation', async () => {
      const { service, repos } = setup();
      const jobOrder = makeJobOrder();
      const plan = {
        id: 'plan-1',
        code: 'PP-202609-0001',
        status: 'APPROVED',
        lines: [],
      };
      const reservation = makeReservation();
      const lockedPackage = {
        ...reservation.materialReceivingPackage,
        materialReceiving: undefined,
      };

      repos[MaterialJobOrder.name].findOne.mockResolvedValue(jobOrder);
      repos[ProductionPlan.name].findOne.mockResolvedValue(plan);
      repos[ProductionPlanReservation.name].createQueryBuilder
        .mockReturnValueOnce(makeQueryBuilder({ many: [reservation] }))
        .mockReturnValueOnce(makeQueryBuilder({ many: [] }));
      repos[MaterialReceivingPackage.name].createQueryBuilder.mockReturnValue(
        makeQueryBuilder({ many: [lockedPackage] }),
      );
      repos[MaterialsDisbursementCounter.name].findOne.mockResolvedValue({
        id: 'counter-1',
        disbursementDate: new Date().toISOString().slice(0, 10),
        lastNumber: 0,
      });
      repos[MaterialsDisbursement.name].save.mockImplementation((value) =>
        Promise.resolve({ ...value, id: 'disbursement-1' }),
      );
      repos[MaterialDisbursementItem.name].save.mockImplementation((value) =>
        Promise.resolve({ ...value, id: 'item-1' }),
      );
      repos[StockBalance.name].findOne.mockResolvedValue({
        id: 'balance-1',
        materialId: 'material-1',
        quantity: '10.0000',
      });
      repos[Material.name].find.mockResolvedValue([
        { id: 'material-1', unitId: 'unit-1' },
      ]);

      await expect(
        service.issue(
          'jo-1',
          {
            version: 1,
            items: [{ reservationId: 'reservation-1', quantity: '10.0000' }],
          },
          'issuer-1',
        ),
      ).resolves.toBeDefined();
    });

    it('leaves the Job Order PARTIALLY_ISSUED when the quantity does not clear the reservation', async () => {
      const { service, repos } = setup();
      const jobOrder = makeJobOrder();
      const plan = {
        id: 'plan-1',
        code: 'PP-202609-0001',
        status: 'APPROVED',
        lines: [],
      };
      const reservation = makeReservation({ reservedQuantity: '10.0000' });

      repos[MaterialJobOrder.name].findOne.mockResolvedValue(jobOrder);
      repos[ProductionPlan.name].findOne.mockResolvedValue(plan);
      repos[ProductionPlanReservation.name].createQueryBuilder
        .mockReturnValueOnce(makeQueryBuilder({ many: [reservation] }))
        .mockReturnValueOnce(makeQueryBuilder({ many: [reservation] })); // still outstanding
      repos[MaterialReceivingPackage.name].createQueryBuilder.mockReturnValue(
        makeQueryBuilder({ many: [reservation.materialReceivingPackage] }),
      );
      repos[MaterialsDisbursementCounter.name].findOne.mockResolvedValue({
        id: 'counter-1',
        disbursementDate: new Date().toISOString().slice(0, 10),
        lastNumber: 0,
      });
      repos[MaterialsDisbursement.name].save.mockImplementation((value) =>
        Promise.resolve({ ...value, id: 'disbursement-1' }),
      );
      repos[MaterialDisbursementItem.name].save.mockImplementation((value) =>
        Promise.resolve({ ...value, id: 'item-1' }),
      );
      repos[StockBalance.name].findOne.mockResolvedValue({
        id: 'balance-1',
        materialId: 'material-1',
        quantity: '10.0000',
      });
      repos[Material.name].find.mockResolvedValue([
        { id: 'material-1', unitId: 'unit-1' },
      ]);

      await service.issue(
        'jo-1',
        {
          version: 1,
          items: [{ reservationId: 'reservation-1', quantity: '4.0000' }],
        },
        'issuer-1',
      );

      expect(reservation.releasedAt).toBeNull();
      expect(reservation.issuedQuantity).toBe('4.0000');
      expect(jobOrder.status).toBe('PARTIALLY_ISSUED');
      expect(plan.status).toBe('APPROVED');
    });

    it('rejects a stale version (409) — no double-issue on a repeated call', async () => {
      const { service, repos } = setup();
      repos[MaterialJobOrder.name].findOne.mockResolvedValue(
        makeJobOrder({ version: 2 }),
      );

      await expect(
        service.issue(
          'jo-1',
          {
            version: 1,
            items: [{ reservationId: 'reservation-1', quantity: '1.0000' }],
          },
          'issuer-1',
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(repos[MaterialsDisbursement.name].save).not.toHaveBeenCalled();
    });

    it('rejects a reservation that does not belong to this Job Order (no FIFO substitution)', async () => {
      const { service, repos } = setup();
      repos[MaterialJobOrder.name].findOne.mockResolvedValue(makeJobOrder());
      repos[ProductionPlan.name].findOne.mockResolvedValue({
        id: 'plan-1',
        status: 'APPROVED',
      });
      repos[ProductionPlanReservation.name].createQueryBuilder.mockReturnValue(
        makeQueryBuilder({ many: [] }), // the requested reservation isn't in this plan
      );

      await expect(
        service.issue(
          'jo-1',
          {
            version: 1,
            items: [
              {
                reservationId: 'reservation-of-another-plan',
                quantity: '1.0000',
              },
            ],
          },
          'issuer-1',
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects issuing more than the outstanding quantity', async () => {
      const { service, repos } = setup();
      const reservation = makeReservation({ reservedQuantity: '5.0000' });
      repos[MaterialJobOrder.name].findOne.mockResolvedValue(makeJobOrder());
      repos[ProductionPlan.name].findOne.mockResolvedValue({
        id: 'plan-1',
        status: 'APPROVED',
      });
      repos[ProductionPlanReservation.name].createQueryBuilder.mockReturnValue(
        makeQueryBuilder({ many: [reservation] }),
      );
      repos[MaterialReceivingPackage.name].createQueryBuilder.mockReturnValue(
        makeQueryBuilder({ many: [reservation.materialReceivingPackage] }),
      );

      await expect(
        service.issue(
          'jo-1',
          {
            version: 1,
            items: [{ reservationId: 'reservation-1', quantity: '99.0000' }],
          },
          'issuer-1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('pick', () => {
    it('rejects a scanned QR that does not match the reserved package', async () => {
      const { service, repos } = setup();
      const jobOrder = makeJobOrder({ status: 'WAITING_PICKING' });
      const reservation = makeReservation({ pickedAt: null, pickedBy: null });
      repos[MaterialJobOrder.name].findOne.mockResolvedValue(jobOrder);
      repos[ProductionPlanReservation.name].createQueryBuilder.mockReturnValue(
        makeQueryBuilder({ one: reservation }),
      );

      await expect(
        service.pick(
          'jo-1',
          {
            version: 1,
            reservationId: 'reservation-1',
            scannedCode: 'WRONG-QR',
          },
          'picker-1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(reservation.pickedAt).toBeNull();
    });

    it('flips WAITING_PICKING to READY_TO_ISSUE once the last line is picked', async () => {
      const { service, repos } = setup();
      const jobOrder = makeJobOrder({ status: 'WAITING_PICKING' });
      const reservation = makeReservation({ pickedAt: null, pickedBy: null });
      repos[MaterialJobOrder.name].findOne.mockResolvedValue(jobOrder);
      repos[ProductionPlan.name].findOne.mockResolvedValue({
        id: 'plan-1',
        code: 'PP-202609-0001',
        status: 'APPROVED',
        lines: [],
      });
      repos[ProductionPlanReservation.name].createQueryBuilder
        .mockReturnValueOnce(makeQueryBuilder({ one: reservation }))
        .mockReturnValueOnce(makeQueryBuilder({ many: [] })); // 0 outstanding-unpicked left

      await service.pick(
        'jo-1',
        {
          version: 1,
          reservationId: 'reservation-1',
          scannedCode: 'CCI-26J07-001-001',
        },
        'picker-1',
      );

      expect(reservation.pickedAt).toBeInstanceOf(Date);
      expect(reservation.pickedBy).toBe('picker-1');
      expect(jobOrder.status).toBe('READY_TO_ISSUE');
    });
  });

  describe('assertCancellable / cancelForPlan', () => {
    it('blocks cancellation once the Job Order has issued anything', async () => {
      const { service, repos, manager } = setup();
      repos[MaterialJobOrder.name].findOne.mockResolvedValue(
        makeJobOrder({ status: 'PARTIALLY_ISSUED' }),
      );

      await expect(
        service.assertCancellable(manager as never, 'plan-1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('is a no-op when the plan has no Job Order yet (still DRAFT)', async () => {
      const { service, manager } = setup();
      await expect(
        service.cancelForPlan(manager as never, 'plan-1', 'reason', 'user-1'),
      ).resolves.toBeUndefined();
    });
  });

  describe('isExpirable', () => {
    it('is false once any line has been picked', async () => {
      const { service, repos, manager } = setup();
      repos[MaterialJobOrder.name].findOne.mockResolvedValue(
        makeJobOrder({ status: 'WAITING_PICKING' }),
      );
      repos[ProductionPlanReservation.name].createQueryBuilder.mockReturnValue(
        makeQueryBuilder({ many: [{}] }), // getCount below reads this via .getCount
      );
      // getCount stub above returns 0 by default; force >0 for this case
      const qb = repos[ProductionPlanReservation.name].createQueryBuilder();
      (qb.getCount as jest.Mock).mockResolvedValue(1);
      repos[ProductionPlanReservation.name].createQueryBuilder.mockReturnValue(
        qb,
      );

      expect(await service.isExpirable(manager as never, 'plan-1')).toBe(false);
    });
  });
});
