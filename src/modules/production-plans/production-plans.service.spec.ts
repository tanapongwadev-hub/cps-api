import { ConflictException } from '@nestjs/common';
import { Workbook } from 'exceljs';
import { AuditLog } from '../../entities/iam/audit-log.entity';
import { MaterialReceivingPackage } from '../../entities/inventory/material-receiving-package.entity';
import { MaterialsDisbursementCounter } from '../../entities/inventory/materials-disbursement-counter.entity';
import { StockBalance } from '../../entities/inventory/stock-balance.entity';
import { StockTransaction } from '../../entities/inventory/stock-transaction.entity';
import { Material } from '../../entities/master/material.entity';
import { ProductBomItem } from '../../entities/master/product-bom.entity';
import { ProductBom } from '../../entities/master/product-bom.entity';
import { Product } from '../../entities/master/product.entity';
import { MaterialDisbursementItem } from '../materials-disbursement/material-disbursement-item.entity';
import { MaterialDisbursementPackage } from '../materials-disbursement/material-disbursement-package.entity';
import { MaterialsDisbursement } from '../materials-disbursement/materials-disbursement.entity';
import { ProductionPlanLine } from './production-plan-line.entity';
import { ProductionPlanReservation } from './production-plan-reservation.entity';
import { ProductionPlan } from './production-plan.entity';
import { ProductionPlansService } from './production-plans.service';

function makeQueryBuilder(many: unknown[] = []) {
  const qb: Record<string, jest.Mock> = {
    innerJoin: jest.fn(() => qb),
    innerJoinAndSelect: jest.fn(() => qb),
    leftJoinAndSelect: jest.fn(() => qb),
    where: jest.fn(() => qb),
    andWhere: jest.fn(() => qb),
    orderBy: jest.fn(() => qb),
    addOrderBy: jest.fn(() => qb),
    setLock: jest.fn(() => qb),
    getMany: jest.fn(() => Promise.resolve(many)),
    getManyAndCount: jest.fn(() => Promise.resolve([many, many.length])),
    skip: jest.fn(() => qb),
    take: jest.fn(() => qb),
  };
  return qb;
}

function makeRepo() {
  return {
    create: jest.fn((value: unknown) => ({ ...(value as object) })),
    save: jest.fn((value: unknown) => Promise.resolve(value)),
    find: jest.fn(() => Promise.resolve([])),
    findOne: jest.fn(() => Promise.resolve(null)),
    delete: jest.fn(() => Promise.resolve({ affected: 1 })),
    remove: jest.fn(() => Promise.resolve()),
    createQueryBuilder: jest.fn(() => makeQueryBuilder()),
  };
}

function makePlan(overrides: Partial<ProductionPlan> = {}): ProductionPlan {
  return {
    id: 'plan-1',
    code: 'PP-202609-0001',
    title: null,
    status: 'DRAFT',
    remark: null,
    createdBy: 'user-1',
    approvedBy: null,
    approvedAt: null,
    issuedBy: null,
    issuedAt: null,
    cancelledBy: null,
    cancelledAt: null,
    cancelReason: null,
    createdAt: new Date('2026-09-20T00:00:00Z'),
    updatedAt: new Date('2026-09-20T00:00:00Z'),
    lines: [],
    ...overrides,
  };
}

function makeJobOrders() {
  return {
    createForPlan: jest
      .fn()
      .mockResolvedValue({ id: 'jo-1', code: 'JO-20260922-0001' }),
    cancelForPlan: jest.fn().mockResolvedValue(undefined),
    assertCancellable: jest.fn().mockResolvedValue(undefined),
    isExpirable: jest.fn().mockResolvedValue(true),
    findSummaryByPlanId: jest.fn().mockResolvedValue(null),
    findSummaryByPlanIds: jest.fn().mockResolvedValue(new Map()),
  };
}

function setup() {
  const entities = [
    ProductionPlan,
    ProductionPlanLine,
    ProductionPlanReservation,
    Product,
    ProductBom,
    ProductBomItem,
    Material,
    MaterialReceivingPackage,
    MaterialsDisbursementCounter,
    MaterialsDisbursement,
    MaterialDisbursementItem,
    MaterialDisbursementPackage,
    StockBalance,
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
    transaction: jest.fn((callback: (value: typeof manager) => unknown) =>
      callback(manager),
    ),
  };
  const jobOrders = makeJobOrders();
  const service = new ProductionPlansService(
    repos[ProductionPlan.name] as never,
    repos[Product.name] as never,
    dataSource as never,
    jobOrders as never,
  );
  return { service, repos, manager, dataSource, jobOrders };
}

describe('ProductionPlansService', () => {
  it('pins the ACTIVE BOM and blocks a product that has no ACTIVE BOM', async () => {
    const { service, repos, manager } = setup();
    manager.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ last_number: 0 }]);
    repos[ProductionPlan.name].save.mockImplementation((value) =>
      Promise.resolve({
        ...value,
        id: 'plan-1',
      }),
    );
    repos[Product.name].findOne.mockResolvedValue({
      id: 'product-1',
      code: 'P-001',
      isActive: true,
    });
    repos[ProductBom.name].findOne.mockResolvedValue(null);

    await expect(
      service.create(
        {
          lines: [
            {
              productId: 'product-1',
              quantity: 1,
              needByDate: '2026-09-30',
            },
          ],
        },
        'user-1',
      ),
    ).rejects.toThrow('Product P-001 has no ACTIVE BOM');
  });

  it('approves atomically with FIFO package locks, excluding scrap and wastage', async () => {
    const { service, repos, manager, jobOrders } = setup();
    const plan = makePlan();
    repos[ProductionPlan.name].findOne
      .mockResolvedValueOnce(plan)
      .mockResolvedValueOnce({ ...plan, status: 'APPROVED', lines: [] });
    repos[ProductionPlanLine.name].find.mockResolvedValue([
      {
        id: 'line-1',
        productionPlanId: plan.id,
        bomId: 'bom-1',
        quantity: 2,
      },
    ]);
    repos[ProductBomItem.name].find.mockResolvedValue([
      {
        id: 'bom-item-input',
        bomId: 'bom-1',
        materialId: 'material-1',
        quantity: '3.0000',
        isScrap: false,
        wastagePercent: '50.00',
        sortOrder: 1,
      },
      {
        id: 'bom-item-scrap',
        bomId: 'bom-1',
        materialId: 'material-2',
        quantity: '100.0000',
        isScrap: true,
        sortOrder: 2,
      },
    ]);
    const pkg = {
      id: 'pkg-1',
      remainingQuantity: '10.0000',
      status: 'in_stock',
      materialReceiving: {
        id: 'receiving-1',
        materialId: 'material-1',
        receiveDate: '2026-09-01',
      },
    };
    const packageQuery = makeQueryBuilder([pkg]);
    repos[MaterialReceivingPackage.name].createQueryBuilder.mockReturnValue(
      packageQuery,
    );
    manager.query.mockResolvedValue([]);
    repos[Material.name].find.mockResolvedValue([
      { id: 'material-1', code: 'MAT-001', name: 'Steel' },
    ]);

    await service.approve(plan.id, 'approver-1');

    expect(packageQuery.setLock).toHaveBeenCalledWith(
      'pessimistic_write',
      undefined,
      ['pkg'],
    );
    const reservation =
      repos[ProductionPlanReservation.name].save.mock.calls[0][0];
    expect(reservation.materialReceivingPackageId).toBe('pkg-1');
    expect(reservation.reservedQuantity).toBe('6.0000');
    expect(repos[ProductionPlanReservation.name].save).toHaveBeenCalledTimes(1);
    expect(plan.status).toBe('APPROVED');
    // A Plan is never left APPROVED without its Job Order — created in the
    // same transaction (see docs/plans/2026-09-23-production-job-order-...).
    expect(jobOrders.createForPlan).toHaveBeenCalledWith(
      manager,
      plan,
      'approver-1',
    );
  });

  it('returns per-material shortfalls and creates no partial Reservation', async () => {
    const { service, repos, manager } = setup();
    const plan = makePlan();
    repos[ProductionPlan.name].findOne.mockResolvedValue(plan);
    repos[ProductionPlanLine.name].find.mockResolvedValue([
      { id: 'line-1', bomId: 'bom-1', quantity: 5 },
    ]);
    repos[ProductBomItem.name].find.mockResolvedValue([
      {
        id: 'item-1',
        materialId: 'material-1',
        quantity: '3.0000',
        isScrap: false,
        sortOrder: 1,
      },
    ]);
    repos[MaterialReceivingPackage.name].createQueryBuilder.mockReturnValue(
      makeQueryBuilder([
        {
          id: 'pkg-1',
          remainingQuantity: '10.0000',
          materialReceiving: { materialId: 'material-1' },
        },
      ]),
    );
    manager.query.mockResolvedValue([]);
    repos[Material.name].find.mockResolvedValue([
      { id: 'material-1', code: 'MAT-001', name: 'Steel' },
    ]);

    await expect(service.approve(plan.id, 'approver-1')).rejects.toMatchObject({
      response: {
        shortfalls: [
          {
            materialCode: 'MAT-001',
            required: '15.0000',
            available: '10.0000',
            shortage: '5.0000',
          },
        ],
      },
    });
    expect(repos[ProductionPlanReservation.name].save).not.toHaveBeenCalled();
  });

  it('releases every active Reservation when an APPROVED plan is cancelled, and cancels its Job Order', async () => {
    const { service, repos, manager, jobOrders } = setup();
    const plan = makePlan({ status: 'APPROVED' });
    const reservation = {
      id: 'reservation-1',
      releasedAt: null,
      releaseType: null,
      releasedBy: null,
    };
    repos[ProductionPlan.name].findOne
      .mockResolvedValueOnce(plan)
      .mockResolvedValueOnce({ ...plan, lines: [] });
    repos[ProductionPlanReservation.name].createQueryBuilder.mockReturnValue(
      makeQueryBuilder([reservation]),
    );

    await service.cancel(plan.id, { reason: 'เปลี่ยนแผน' }, 'user-1');

    expect(reservation.releasedAt).toBeInstanceOf(Date);
    expect(reservation.releaseType).toBe('CANCELLED');
    expect(reservation.releasedBy).toBe('user-1');
    expect(plan.status).toBe('CANCELLED');
    // assertCancellable must run BEFORE the reservations are released.
    expect(jobOrders.assertCancellable).toHaveBeenCalledWith(manager, plan.id);
    expect(jobOrders.cancelForPlan).toHaveBeenCalledWith(
      manager,
      plan.id,
      'เปลี่ยนแผน',
      'user-1',
    );
  });

  it('blocks cancelling an APPROVED plan whose Job Order already issued something', async () => {
    const { service, repos, jobOrders } = setup();
    const plan = makePlan({ status: 'APPROVED' });
    repos[ProductionPlan.name].findOne.mockResolvedValueOnce(plan);
    jobOrders.assertCancellable.mockRejectedValueOnce(
      new ConflictException('จ่ายออกไปแล้วบางส่วน'),
    );

    await expect(
      service.cancel(plan.id, { reason: 'เปลี่ยนแผน' }, 'user-1'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(jobOrders.cancelForPlan).not.toHaveBeenCalled();
    // Reservations must not have been touched either.
    expect(repos[ProductionPlanReservation.name].save).not.toHaveBeenCalled();
  });

  it('auto-expires a manually backdated APPROVED plan after three days (Job Order still WAITING_PICKING)', async () => {
    const { service, repos, jobOrders } = setup();
    const plan = makePlan({
      status: 'APPROVED',
      approvedAt: new Date('2026-09-01T00:00:00Z'),
    });
    const reservation = {
      id: 'reservation-1',
      releasedAt: null,
      releaseType: null,
      releasedBy: null,
    };
    repos[ProductionPlan.name].find.mockResolvedValue([{ id: plan.id }]);
    repos[ProductionPlan.name].findOne.mockResolvedValue(plan);
    repos[ProductionPlanReservation.name].createQueryBuilder.mockReturnValue(
      makeQueryBuilder([reservation]),
    );

    const count = await service.expireApprovedPlans(
      new Date('2026-09-05T00:00:01Z'),
    );

    expect(count).toBe(1);
    expect(plan.status).toBe('EXPIRED');
    expect(plan.cancelReason).toContain('3 วัน');
    expect(reservation.releaseType).toBe('EXPIRED');
    expect(reservation.releasedBy).toBeNull();
    expect(jobOrders.cancelForPlan).toHaveBeenCalled();
  });

  it('does not auto-expire once picking has started on the Job Order', async () => {
    const { service, repos, jobOrders } = setup();
    const plan = makePlan({
      status: 'APPROVED',
      approvedAt: new Date('2026-09-01T00:00:00Z'),
    });
    repos[ProductionPlan.name].find.mockResolvedValue([{ id: plan.id }]);
    repos[ProductionPlan.name].findOne.mockResolvedValue(plan);
    jobOrders.isExpirable.mockResolvedValue(false);

    const count = await service.expireApprovedPlans(
      new Date('2026-09-05T00:00:01Z'),
    );

    expect(count).toBe(0);
    expect(plan.status).toBe('APPROVED');
    expect(jobOrders.cancelForPlan).not.toHaveBeenCalled();
  });

  it('POST /production-plans/:id/issue is disabled and points to the Job Order', async () => {
    const { service, repos } = setup();
    repos[ProductionPlan.name].findOne.mockResolvedValue(
      makePlan({ status: 'APPROVED' }),
    );

    await expect(service.issue('plan-1', 'user-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('imports one Excel file as one plan with one line per data row', async () => {
    const { service, repos } = setup();
    const workbook = new Workbook();
    const sheet = workbook.addWorksheet('Plan');
    sheet.addRow(['Product Code', 'Quantity', 'Need-by Date', 'Remark']);
    sheet.addRow(['P-001', 10, '2026-09-28', 'first']);
    sheet.addRow(['P-002', 20, new Date('2026-09-29T00:00:00Z'), 'second']);
    const arrayBuffer = await workbook.xlsx.writeBuffer();
    repos[Product.name].find.mockResolvedValue([
      { id: 'product-1', code: 'P-001', isActive: true },
      { id: 'product-2', code: 'P-002', isActive: true },
    ]);
    const create = jest.spyOn(service, 'create').mockResolvedValue(makePlan());

    await service.importExcel(
      { buffer: Buffer.from(new Uint8Array(arrayBuffer)) },
      { title: 'September run' },
      'user-1',
    );

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'September run',
        lines: [
          expect.objectContaining({
            productId: 'product-1',
            quantity: 10,
            needByDate: '2026-09-28',
          }),
          expect.objectContaining({
            productId: 'product-2',
            quantity: 20,
            needByDate: '2026-09-29',
          }),
        ],
      }),
      'user-1',
    );
  });

  it('uses a conflict response for an invalid lifecycle transition', async () => {
    const { service, repos } = setup();
    repos[ProductionPlan.name].findOne.mockResolvedValue(
      makePlan({ status: 'ISSUED' }),
    );
    await expect(service.approve('plan-1', 'user-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
