/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { NotFoundException } from '@nestjs/common';
import { MaterialTraceabilityService } from './material-traceability.service';
import { QueryMaterialTraceabilityDto } from './dto/query-material-traceability.dto';

function makeQueryBuilder(overrides: Record<string, unknown> = {}) {
  const calls: { andWhere: Array<[string, unknown]> } = { andWhere: [] };
  const qb: Record<string, jest.Mock> = {
    leftJoin: jest.fn(() => qb),
    leftJoinAndSelect: jest.fn(() => qb),
    where: jest.fn(() => qb),
    andWhere: jest.fn((sql: string, params?: unknown) => {
      calls.andWhere.push([sql, params]);
      return qb;
    }),
    select: jest.fn(() => qb),
    addSelect: jest.fn(() => qb),
    groupBy: jest.fn(() => qb),
    orderBy: jest.fn(() => qb),
    addOrderBy: jest.fn(() => qb),
    offset: jest.fn(() => qb),
    limit: jest.fn(() => qb),
    skip: jest.fn(() => qb),
    take: jest.fn(() => qb),
    getOne: jest.fn(() => Promise.resolve(null)),
    getMany: jest.fn(() => Promise.resolve([])),
    getRawMany: jest.fn(() => Promise.resolve([])),
    getRawOne: jest.fn(() => Promise.resolve(undefined)),
    getCount: jest.fn(() => Promise.resolve(0)),
    ...overrides,
  };
  return { qb, calls };
}

interface RepoMock {
  findOne: jest.Mock;
  find: jest.Mock;
  createQueryBuilder: jest.Mock;
}

function makeRepo(overrides: Partial<RepoMock> = {}): RepoMock {
  return {
    findOne: jest.fn(() => Promise.resolve(null)),
    find: jest.fn(() => Promise.resolve([])),
    createQueryBuilder: jest.fn(),
    ...overrides,
  };
}

function setup() {
  const stockTransactionRepo = makeRepo();
  const stockBalanceRepo = makeRepo();
  const receivingRepo = makeRepo();
  const packageRepo = makeRepo();
  const disbursementRepo = makeRepo();
  const disbursementPackageRepo = makeRepo();
  const disbursementItemRepo = makeRepo();
  const materialRepo = makeRepo();
  const dataSource: any = {
    getRepository: jest.fn(() => materialRepo),
  };

  const service = new MaterialTraceabilityService(
    stockTransactionRepo as never,
    stockBalanceRepo as never,
    receivingRepo as never,
    packageRepo as never,
    disbursementRepo as never,
    disbursementPackageRepo as never,
    disbursementItemRepo as never,
    dataSource,
  );

  return {
    service,
    repos: {
      stockTransactionRepo,
      stockBalanceRepo,
      receivingRepo,
      packageRepo,
      disbursementRepo,
      disbursementPackageRepo,
      disbursementItemRepo,
      materialRepo,
    },
  };
}

describe('MaterialTraceabilityService', () => {
  describe('reconcileMaterial / reconcileMaterials — §11 running balance vs stock balance (batched: 3 queries total, not 3 per material)', () => {
    it('flags isMatched=true when the ledger sum equals stock_balances.quantity', async () => {
      const { service, repos } = setup();
      repos.materialRepo.find.mockResolvedValue([{ id: '3', code: 'MAT-A' }]);
      const { qb } = makeQueryBuilder({
        getRawMany: jest.fn(() =>
          Promise.resolve([{ materialId: '3', balance: '40.0000' }]),
        ),
      });
      repos.stockTransactionRepo.createQueryBuilder.mockReturnValue(qb);
      repos.stockBalanceRepo.find.mockResolvedValue([
        { materialId: '3', quantity: '40.0000' },
      ]);

      const result = await service.reconcileMaterial('3');
      expect(result.isMatched).toBe(true);
      expect(result.ledgerBalance).toBe('40.0000');
      expect(result.stockBalance).toBe('40.0000');
    });

    it('flags STOCK MISMATCH when the ledger sum and stock_balances disagree', async () => {
      const { service, repos } = setup();
      repos.materialRepo.find.mockResolvedValue([{ id: '3', code: 'MAT-A' }]);
      const { qb } = makeQueryBuilder({
        getRawMany: jest.fn(() =>
          Promise.resolve([{ materialId: '3', balance: '38.0000' }]),
        ),
      });
      repos.stockTransactionRepo.createQueryBuilder.mockReturnValue(qb);
      repos.stockBalanceRepo.find.mockResolvedValue([
        { materialId: '3', quantity: '40.0000' },
      ]);

      const result = await service.reconcileMaterial('3');
      expect(result.isMatched).toBe(false);
      expect(result.ledgerBalance).toBe('38.0000');
      expect(result.stockBalance).toBe('40.0000');
    });

    it('treats a material with no stock_balances row as zero (not a crash)', async () => {
      const { service, repos } = setup();
      repos.materialRepo.find.mockResolvedValue([{ id: '9', code: 'MAT-Z' }]);
      const { qb } = makeQueryBuilder({
        getRawMany: jest.fn(() =>
          Promise.resolve([{ materialId: '9', balance: '0.0000' }]),
        ),
      });
      repos.stockTransactionRepo.createQueryBuilder.mockReturnValue(qb);
      repos.stockBalanceRepo.find.mockResolvedValue([]);

      const result = await service.reconcileMaterial('9');
      expect(result.isMatched).toBe(true);
      expect(result.stockBalance).toBe('0.0000');
    });

    it('reconciles many materials with exactly 3 queries (1 grouped ledger sum, 1 stock_balances, 1 materials) — not 3 per material', async () => {
      const { service, repos } = setup();
      repos.materialRepo.find.mockResolvedValue([
        { id: '1', code: 'MAT-A' },
        { id: '2', code: 'MAT-B' },
        { id: '3', code: 'MAT-C' },
      ]);
      const { qb } = makeQueryBuilder({
        getRawMany: jest.fn(() =>
          Promise.resolve([
            { materialId: '1', balance: '10.0000' },
            { materialId: '2', balance: '20.0000' },
            // material '3' has no ledger rows at all — must default to 0,
            // not be silently dropped from the result array.
          ]),
        ),
      });
      repos.stockTransactionRepo.createQueryBuilder.mockReturnValue(qb);
      repos.stockBalanceRepo.find.mockResolvedValue([
        { materialId: '1', quantity: '10.0000' },
        { materialId: '2', quantity: '25.0000' }, // deliberate mismatch
      ]);

      const results = await service.reconcileMaterials(['1', '2', '3']);

      expect(results).toHaveLength(3);
      expect(
        repos.stockTransactionRepo.createQueryBuilder,
      ).toHaveBeenCalledTimes(1);
      expect(repos.stockBalanceRepo.find).toHaveBeenCalledTimes(1);
      expect(repos.materialRepo.find).toHaveBeenCalledTimes(1);

      const byId = new Map(results.map((r) => [r.materialId, r]));
      expect(byId.get('1')).toMatchObject({
        isMatched: true,
        ledgerBalance: '10.0000',
      });
      expect(byId.get('2')).toMatchObject({
        isMatched: false,
        ledgerBalance: '20.0000',
        stockBalance: '25.0000',
      });
      expect(byId.get('3')).toMatchObject({
        isMatched: true,
        ledgerBalance: '0.0000',
        stockBalance: '0.0000',
      });
    });

    it('returns an empty array without querying anything when given no material ids', async () => {
      const { service, repos } = setup();
      const results = await service.reconcileMaterials([]);
      expect(results).toEqual([]);
      expect(
        repos.stockTransactionRepo.createQueryBuilder,
      ).not.toHaveBeenCalled();
    });
  });

  describe('getSummary — hasMismatch propagation', () => {
    it('sets hasMismatch=true when any reconciled material disagrees', async () => {
      const { service, repos } = setup();
      const summaryQb = makeQueryBuilder({
        getRawOne: jest.fn(() =>
          Promise.resolve({
            receivingCount: '1',
            disbursementCount: '1',
            totalReceived: '40.0000',
            totalIssued: '8.0000',
            lotCount: '1',
            mainQrCount: '1',
            subQrCount: '2',
            activeQrCount: '1',
            exhaustedQrCount: '1',
          }),
        ),
      });
      const materialIdsQb = makeQueryBuilder({
        getRawMany: jest.fn(() => Promise.resolve([{ materialId: '3' }])),
      });
      const reconcileQb = makeQueryBuilder({
        getRawMany: jest.fn(() =>
          Promise.resolve([{ materialId: '3', balance: '30.0000' }]),
        ),
      });
      let call = 0;
      repos.stockTransactionRepo.createQueryBuilder.mockImplementation(() => {
        call += 1;
        if (call === 1) return summaryQb.qb;
        if (call === 2) return materialIdsQb.qb;
        return reconcileQb.qb;
      });
      repos.materialRepo.find.mockResolvedValue([{ id: '3', code: 'MAT-A' }]);
      repos.stockBalanceRepo.find.mockResolvedValue([
        { materialId: '3', quantity: '32.0000' }, // deliberately different from the ledger sum
      ]);

      const summary = await service.getSummary(
        new QueryMaterialTraceabilityDto(),
      );
      expect(summary.hasMismatch).toBe(true);
      expect(summary.receivingCount).toBe(1);
      expect(summary.totalReceived).toBe('40.0000');
      // 40 received - 8 issued = 32 net movement in the filtered slice
      expect(summary.currentBalance).toBe('32.0000');
    });
  });

  describe('applyFilters (exercised via getMovements) — parameterized, never string-concatenated', () => {
    it('binds every filter value through the params object, never inline in the SQL text', async () => {
      const { service, repos } = setup();
      const { qb, calls } = makeQueryBuilder();
      repos.stockTransactionRepo.createQueryBuilder.mockReturnValue(qb);

      const query = Object.assign(new QueryMaterialTraceabilityDto(), {
        dateFrom: '2026-09-01',
        dateTo: '2026-09-20',
        materialCode: "AC-5C'; DROP TABLE stock_transactions; --",
        supplierId: '2',
        transactionType: 'ISSUE',
        operator: 'admin01',
      });

      await service.getMovements(query);

      // The dangerous payload must appear only as a bound parameter value,
      // never spliced into the SQL string itself.
      for (const [sql] of calls.andWhere) {
        expect(sql).not.toContain('DROP TABLE');
      }
      const materialCodeCall = calls.andWhere.find(([sql]) =>
        sql.includes('material.code'),
      );
      expect(materialCodeCall?.[1]).toEqual({
        materialCode: "%AC-5C'; DROP TABLE stock_transactions; --%",
      });

      const transactionTypeCall = calls.andWhere.find(([sql]) =>
        sql.includes('st.transaction_type'),
      );
      expect(transactionTypeCall?.[1]).toEqual({ transactionType: 'ISSUE' });
    });

    it('omits a filter entirely when its field is not provided', async () => {
      const { service, repos } = setup();
      const { qb, calls } = makeQueryBuilder();
      repos.stockTransactionRepo.createQueryBuilder.mockReturnValue(qb);

      await service.getMovements(new QueryMaterialTraceabilityDto());

      expect(calls.andWhere).toHaveLength(0);
    });
  });

  describe('traceByCode — §12 scan-and-resolve', () => {
    it('resolves a SUB QR code to traceSubQr', async () => {
      const { service, repos } = setup();
      repos.packageRepo.findOne.mockResolvedValue({
        id: 'pkg-1',
        materialReceivingId: '10',
        packageNo: 1,
        lotDetailNo: 'CCI-20260901-001-001',
        quantity: '20.0000',
        remainingQuantity: '20.0000',
        status: 'in_stock',
      });
      const { qb: receivingQb } = makeQueryBuilder({
        getOne: jest.fn(() =>
          Promise.resolve({
            id: '10',
            internalLotNo: 'CCI-20260901-001',
            receiveDate: '2026-09-01',
            material: { id: '3', code: 'MAT-A', name: 'Material A' },
            supplier: null,
          }),
        ),
      });
      repos.receivingRepo.createQueryBuilder.mockReturnValue(receivingQb);
      repos.stockTransactionRepo.find.mockResolvedValue([]);
      const { qb: allocQb } = makeQueryBuilder({
        getMany: jest.fn(() => Promise.resolve([])),
      });
      repos.disbursementPackageRepo.createQueryBuilder.mockReturnValue(allocQb);

      const result = await service.traceByCode('CCI-20260901-001-001');
      expect(result.qrLevel).toBe('SUB');
    });

    it('resolves a MAIN QR (receiving internal lot no) to traceMainQr', async () => {
      const { service, repos } = setup();
      repos.packageRepo.findOne.mockResolvedValue(null);
      repos.receivingRepo.findOne.mockResolvedValue({ id: '10' });
      const { qb: receivingQb } = makeQueryBuilder({
        getOne: jest.fn(() =>
          Promise.resolve({
            id: '10',
            traceId: 'TRC-RCV-1',
            internalLotNo: 'CCI-20260901-001',
            supplierLotNo: '26I01',
            receiveDate: '2026-09-01',
            receiveQuantity: '40',
            piecesQuantity: null,
            status: 'confirmed',
            material: { id: '3', code: 'MAT-A', name: 'Material A' },
            supplier: null,
            unit: { symbol: 'PCS' },
            confirmedBy: '9',
            confirmedAt: new Date(),
            createdBy: '9',
            createdAt: new Date(),
          }),
        ),
      });
      repos.receivingRepo.createQueryBuilder.mockReturnValue(receivingQb);
      repos.packageRepo.find.mockResolvedValue([]);
      repos.stockTransactionRepo.find.mockResolvedValue([]);
      const { qb: allocQb } = makeQueryBuilder({
        getMany: jest.fn(() => Promise.resolve([])),
      });
      repos.disbursementPackageRepo.createQueryBuilder.mockReturnValue(allocQb);

      const result = await service.traceByCode('CCI-20260901-001');
      expect(result.qrLevel).toBe('MAIN');
    });

    it('throws NotFoundException when neither a SUB nor MAIN QR matches', async () => {
      const { service, repos } = setup();
      repos.packageRepo.findOne.mockResolvedValue(null);
      repos.receivingRepo.findOne.mockResolvedValue(null);

      await expect(service.traceByCode('UNKNOWN-CODE')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('traceSubQr — adjustment history is a real filtered subset, not every movement', () => {
    it('only includes ADJUST_IN/ADJUST_OUT movements in adjustmentHistory', async () => {
      const { service, repos } = setup();
      repos.packageRepo.findOne.mockResolvedValue({
        id: 'pkg-1',
        materialReceivingId: '10',
        packageNo: 1,
        lotDetailNo: 'CCI-20260901-001-001',
        quantity: '20.0000',
        remainingQuantity: '18.0000',
        status: 'partial',
      });
      const { qb: receivingQb } = makeQueryBuilder({
        getOne: jest.fn(() => Promise.resolve(null)),
      });
      repos.receivingRepo.createQueryBuilder.mockReturnValue(receivingQb);
      repos.stockTransactionRepo.find.mockResolvedValue([
        {
          id: '1',
          transactionType: 'RECEIVE',
          quantityIn: '20.0000',
          quantityOut: '0',
        },
        {
          id: '2',
          transactionType: 'ADJUST_OUT',
          quantityIn: '0',
          quantityOut: '2.0000',
        },
        {
          id: '3',
          transactionType: 'ISSUE',
          quantityIn: '0',
          quantityOut: '0',
        },
      ]);
      const { qb: allocQb } = makeQueryBuilder({
        getMany: jest.fn(() => Promise.resolve([])),
      });
      repos.disbursementPackageRepo.createQueryBuilder.mockReturnValue(allocQb);

      const result = await service.traceSubQr('pkg-1');
      expect(result.adjustmentHistory).toHaveLength(1);
      expect(result.adjustmentHistory[0].id).toBe('2');
      expect(result.movements).toHaveLength(3);
    });
  });

  describe('subQrIssueHistory (via traceMainQr) — preserves reversed allocations, not filtered out', () => {
    it('includes a reversed allocation in the history with reversedAt/reversedBy populated', async () => {
      const { service, repos } = setup();
      const { qb: receivingQb } = makeQueryBuilder({
        getOne: jest.fn(() =>
          Promise.resolve({
            id: '10',
            traceId: 'TRC-RCV-1',
            internalLotNo: 'CCI-20260901-001',
            supplierLotNo: '26I01',
            receiveDate: '2026-09-01',
            receiveQuantity: '20',
            piecesQuantity: null,
            status: 'confirmed',
            material: null,
            supplier: null,
            unit: null,
            confirmedBy: '9',
            confirmedAt: new Date(),
            createdBy: '9',
            createdAt: new Date(),
          }),
        ),
      });
      repos.receivingRepo.createQueryBuilder.mockReturnValue(receivingQb);
      repos.packageRepo.find.mockResolvedValue([
        {
          id: 'pkg-1',
          packageNo: 1,
          lotDetailNo: 'CCI-20260901-001-001',
          quantity: '20.0000',
          remainingQuantity: '20.0000',
          status: 'in_stock',
        },
      ]);
      repos.stockTransactionRepo.find.mockResolvedValue([]);
      const { qb: allocQb } = makeQueryBuilder({
        getMany: jest.fn(() =>
          Promise.resolve([
            {
              id: 'alloc-1',
              packageId: 'pkg-1',
              disbursedQuantity: '10.0000',
              fifoOrder: 1,
              reversedAt: new Date('2026-09-05T00:00:00.000Z'),
              reversedBy: '9',
              disbursementItem: {
                disbursement: {
                  id: '20',
                  disbursementNo: 'DIS-20260905-0001',
                  departmentId: '4',
                  productionOrder: 'PO-1',
                },
              },
            },
          ]),
        ),
      });
      repos.disbursementPackageRepo.createQueryBuilder.mockReturnValue(allocQb);

      const result = await service.traceMainQr('10');
      expect(result.issueHistory).toHaveLength(1);
      expect(result.issueHistory[0].reversedAt).toBeInstanceOf(Date);
      expect(result.issueHistory[0].disbursementNo).toBe('DIS-20260905-0001');
    });
  });
});
