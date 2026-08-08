import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { RejectReason } from '../../entities/master/reject-reason.entity';
import { RejectReasonsService } from './reject-reasons.service';

type Row = {
  id: string;
  code: string;
  nameTh: string;
  nameEn: string | null;
  description: string | null;
  isActive: boolean;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function makeRow(overrides: Partial<Row> = {}): Row {
  return {
    id: '1',
    code: 'WET',
    nameTh: 'ของเปียก',
    nameEn: 'Wet goods',
    description: null,
    isActive: true,
    createdBy: '9',
    updatedBy: '9',
    createdAt: new Date('2026-08-08T00:00:00.000Z'),
    updatedAt: new Date('2026-08-08T00:00:00.000Z'),
    ...overrides,
  };
}

function makeQueryBuilder(rows: Row[] = []) {
  const builder: Record<string, jest.Mock> = {
    andWhere: jest.fn(() => builder),
    where: jest.fn(() => builder),
    orderBy: jest.fn(() => builder),
    addOrderBy: jest.fn(() => builder),
    skip: jest.fn(() => builder),
    take: jest.fn(() => builder),
    getManyAndCount: jest.fn(() => Promise.resolve([rows, rows.length])),
    getOne: jest.fn(() => Promise.resolve(null)),
  };
  return builder;
}

describe('RejectReasonsService', () => {
  let service: RejectReasonsService;
  let repo: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
    createQueryBuilder: jest.Mock;
  };

  beforeEach(async () => {
    repo = {
      create: jest.fn((payload: unknown) => ({ ...(payload as object) })),
      save: jest.fn((entity: unknown) => Promise.resolve(entity)),
      findOne: jest.fn(() => Promise.resolve(null)),
      createQueryBuilder: jest.fn(() => makeQueryBuilder()),
    };
    const dataSource = {
      transaction: jest.fn((callback: (manager: unknown) => unknown) =>
        Promise.resolve(callback({ getRepository: () => repo })),
      ),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        RejectReasonsService,
        { provide: getRepositoryToken(RejectReason), useValue: repo },
        { provide: getDataSourceToken(), useValue: dataSource },
      ],
    }).compile();

    service = moduleRef.get(RejectReasonsService);
  });

  it('uppercases and trims the code on create', async () => {
    const result = await service.create(
      { code: '  wet  ', nameTh: '  ของเปียก  ' },
      'u1',
    );
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'WET',
        nameTh: 'ของเปียก',
        isActive: true,
        createdBy: 'u1',
      }),
    );
    expect(result.code).toBe('WET');
  });

  it('turns a blank optional string into null', async () => {
    await service.create(
      { code: 'WET', nameTh: 'ของเปียก', nameEn: '   ' },
      'u1',
    );
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ nameEn: null }),
    );
  });

  it('rejects a duplicate code case-insensitively', async () => {
    const builder = makeQueryBuilder();
    builder.getOne.mockResolvedValue(makeRow());
    repo.createQueryBuilder.mockReturnValue(builder);
    await expect(
      service.create({ code: 'wet', nameTh: 'ของเปียก' }, 'u1'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(builder.where).toHaveBeenCalledWith(
      'LOWER(rejectReason.code) = LOWER(:code)',
      { code: 'WET' },
    );
  });

  it('returns 404 when updating a missing reason', async () => {
    await expect(
      service.update('1', { updatedAt: '2026-08-08T00:00:00.000Z' }, 'u1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects a stale updatedAt', async () => {
    repo.findOne.mockResolvedValue(makeRow());
    await expect(
      service.update('1', { updatedAt: '2020-01-01T00:00:00.000Z' }, 'u1'),
    ).rejects.toThrow(/has been updated/);
  });

  it('deactivates instead of deleting', async () => {
    repo.findOne.mockResolvedValue(makeRow());
    const result = await service.deactivate('1', 'u1');
    expect(result.isActive).toBe(false);
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ isActive: false, updatedBy: 'u1' }),
    );
  });

  it('restores a deactivated reason', async () => {
    repo.findOne.mockResolvedValue(makeRow({ isActive: false }));
    const result = await service.restore('1', 'u1');
    expect(result.isActive).toBe(true);
  });

  it('translates a unique violation from the database into 409', async () => {
    repo.save.mockRejectedValue({ code: '23505' });
    await expect(
      service.create({ code: 'WET', nameTh: 'ของเปียก' }, 'u1'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('paginates and reports totals', async () => {
    repo.createQueryBuilder.mockReturnValue(
      makeQueryBuilder([makeRow(), makeRow({ id: '2', code: 'BROKEN' })]),
    );
    const result = await service.findAll({
      page: 1,
      limit: 20,
      sortBy: 'code',
      sortOrder: 'asc',
    } as never);
    expect(result.items).toHaveLength(2);
    expect(result.meta).toEqual({
      page: 1,
      limit: 20,
      totalItems: 2,
      totalPages: 1,
    });
  });
});
