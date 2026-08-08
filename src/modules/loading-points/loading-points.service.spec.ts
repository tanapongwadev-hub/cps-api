import { Test, type TestingModule } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { LoadingPoint } from '../../entities/master/loading-point.entity';
import { LoadingPointsService } from './loading-points.service';

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
    code: 'LP-01',
    nameTh: 'จุดขนถ่าย A',
    nameEn: 'Loading Point A',
    description: 'ใช้สำหรับงานกลาง',
    isActive: true,
    createdBy: '9',
    updatedBy: '9',
    createdAt: new Date('2026-08-04T00:00:00.000Z'),
    updatedAt: new Date('2026-08-04T00:00:00.000Z'),
    ...overrides,
  };
}

function makeQueryBuilder(rows: Row[] = [], total = rows.length) {
  const builder: any = {
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([rows, total]),
    where: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(null),
  };
  return builder;
}

describe('LoadingPointsService', () => {
  let service: LoadingPointsService;
  let repo: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let dataSource: { transaction: jest.Mock };

  beforeEach(async () => {
    repo = {
      create: jest.fn((payload) => ({ ...payload })),
      save: jest.fn(async (entity) => entity),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(() => makeQueryBuilder()),
    };
    dataSource = {
      transaction: jest.fn(async (cb) => cb({ getRepository: () => repo })),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        LoadingPointsService,
        { provide: getRepositoryToken(LoadingPoint), useValue: repo },
        { provide: getDataSourceToken(), useValue: dataSource },
      ],
    }).compile();

    service = moduleRef.get(LoadingPointsService);
  });

  describe('create', () => {
    it('normalizes code, trims strings, saves audit ids', async () => {
      const result = await service.create(
        { code: ' lp-01 ', nameTh: ' จุดขนถ่าย A ' },
        'user-1',
      );
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'LP-01',
          nameTh: 'จุดขนถ่าย A',
          isActive: true,
        }),
      );
      expect(result.code).toBe('LP-01');
    });

    it('throws ConflictException on duplicate code', async () => {
      const builder = makeQueryBuilder();
      builder.getOne.mockResolvedValue(makeRow());
      repo.createQueryBuilder.mockReturnValue(builder);
      await expect(
        service.create({ code: 'LP-01', nameTh: 'จุดขนถ่าย A' } as any, 'u'),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('update', () => {
    it('rejects with NotFound when id missing', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(
        service.update(
          '99',
          { updatedAt: new Date().toISOString() } as any,
          'u',
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects with ConflictException on stale updatedAt', async () => {
      const row = makeRow({ updatedAt: new Date('2026-08-04T00:00:00.000Z') });
      repo.findOne.mockResolvedValue(row);
      await expect(
        service.update(
          '1',
          { nameTh: 'x', updatedAt: '2026-01-01T00:00:00.000Z' } as any,
          'u',
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('applies update and stamps updatedBy', async () => {
      const row = makeRow({ updatedAt: new Date('2026-08-04T00:00:00.000Z') });
      repo.findOne.mockResolvedValue(row);
      repo.save.mockImplementation(async (e: any) => e);
      const result = await service.update(
        '1',
        {
          nameTh: 'จุดขนถ่าย B',
          updatedAt: '2026-08-04T00:00:00.000Z',
        },
        'user-2',
      );
      expect(result.nameTh).toBe('จุดขนถ่าย B');
      expect(result.updatedBy).toBe('user-2');
    });
  });

  describe('deactivate / restore', () => {
    it('sets isActive=false on deactivate', async () => {
      const row = makeRow({ isActive: true });
      repo.findOne.mockResolvedValue(row);
      repo.save.mockImplementation(async (e: any) => e);
      const result = await service.deactivate('1', 'user-1');
      expect(result.isActive).toBe(false);
    });

    it('sets isActive=true on restore', async () => {
      const row = makeRow({ isActive: false });
      repo.findOne.mockResolvedValue(row);
      repo.save.mockImplementation(async (e: any) => e);
      const result = await service.restore('1', 'user-1');
      expect(result.isActive).toBe(true);
    });
  });

  describe('findAll / findOne', () => {
    it('applies search and filter, returns paginated items', async () => {
      const builder = makeQueryBuilder([makeRow()], 1);
      repo.createQueryBuilder.mockReturnValue(builder);
      const result = await service.findAll({
        page: 1,
        limit: 20,
        search: 'A',
        isActive: true,
        sortBy: 'code',
        sortOrder: 'asc',
      } as any);
      expect(builder.andWhere).toHaveBeenCalled();
      expect(result.items).toHaveLength(1);
    });

    it('throws NotFoundException on findOne when missing', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.findOne('99')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
