import { Test, type TestingModule } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Unit } from '../../entities/master/unit.entity';
import { UnitsService } from './units.service';
import { CreateUnitDto } from './dto/create-unit.dto';
import { UpdateUnitDto } from './dto/update-unit.dto';

type UnitRow = {
  id: string;
  code: string;
  nameTh: string;
  nameEn: string | null;
  symbol: string | null;
  description: string | null;
  isActive: boolean;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function makeRow(overrides: Partial<UnitRow> = {}): UnitRow {
  return {
    id: '1',
    code: 'PCS',
    nameTh: 'ชิ้น',
    nameEn: 'Piece',
    symbol: 'ชิ้น',
    description: null,
    isActive: true,
    createdBy: '9',
    updatedBy: '9',
    createdAt: new Date('2026-08-04T00:00:00.000Z'),
    updatedAt: new Date('2026-08-04T00:00:00.000Z'),
    ...overrides,
  };
}

function makeQueryBuilder(rows: UnitRow[] = [], total = rows.length) {
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

describe('UnitsService', () => {
  let service: UnitsService;
  let unitRepository: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let dataSource: { transaction: jest.Mock };

  beforeEach(async () => {
    unitRepository = {
      create: jest.fn((payload) => ({ ...payload })),
      save: jest.fn(async (entity) => entity),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(() => makeQueryBuilder()),
    };
    dataSource = {
      transaction: jest.fn(async (cb) =>
        cb({ getRepository: () => unitRepository }),
      ),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        UnitsService,
        { provide: getRepositoryToken(Unit), useValue: unitRepository },
        { provide: getDataSourceToken(), useValue: dataSource },
      ],
    }).compile();

    service = moduleRef.get(UnitsService);
  });

  describe('create', () => {
    it('normalizes the code to uppercase, saves audit ids, and returns the row', async () => {
      const dto: CreateUnitDto = { code: ' pcs ', nameTh: ' ชิ้น ' } as any;
      const saved = makeRow({ code: 'PCS', nameTh: 'ชิ้น' });
      unitRepository.findOne.mockResolvedValue(null);
      unitRepository.save.mockResolvedValue(saved);

      const result = await service.create(dto, 'user-1');

      expect(unitRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'PCS',
          nameTh: 'ชิ้น',
          isActive: true,
          createdBy: 'user-1',
          updatedBy: 'user-1',
        }),
      );
      expect(result.code).toBe('PCS');
    });

    it('throws ConflictException when code already exists', async () => {
      const builder = makeQueryBuilder();
      builder.getOne.mockResolvedValue(makeRow());
      unitRepository.createQueryBuilder.mockReturnValue(builder);
      await expect(
        service.create({ code: 'PCS', nameTh: 'ชิ้น' } as any, 'user-1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rolls back when the save throws', async () => {
      unitRepository.findOne.mockResolvedValue(null);
      unitRepository.save.mockRejectedValue(new Error('boom'));
      await expect(
        service.create({ code: 'PCS', nameTh: 'ชิ้น' } as any, 'user-1'),
      ).rejects.toThrow('boom');
      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('update', () => {
    it('rejects with NotFoundException when id is missing', async () => {
      unitRepository.findOne.mockResolvedValue(null);
      await expect(
        service.update('99', { updatedAt: new Date().toISOString() } as any, 'u'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects with ConflictException when updatedAt is stale', async () => {
      const row = makeRow({
        updatedAt: new Date('2026-08-04T00:00:00.000Z'),
      });
      unitRepository.findOne.mockResolvedValue(row);
      await expect(
        service.update('1', { nameTh: 'x', updatedAt: '2026-01-01T00:00:00.000Z' } as any, 'u'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('applies the update and stamps updatedBy', async () => {
      const row = makeRow({
        updatedAt: new Date('2026-08-04T00:00:00.000Z'),
      });
      unitRepository.findOne.mockResolvedValue(row);
      unitRepository.save.mockImplementation(async (entity: any) => entity);
      const dto: UpdateUnitDto = {
        nameTh: 'กิโลกรัม',
        updatedAt: '2026-08-04T00:00:00.000Z',
      } as any;

      const result = await service.update('1', dto, 'user-2');

      expect(result.nameTh).toBe('กิโลกรัม');
      expect(result.updatedBy).toBe('user-2');
    });

    it('rejects duplicate code on update', async () => {
      const row = makeRow({
        code: 'PCS',
        updatedAt: new Date('2026-08-04T00:00:00.000Z'),
      });
      unitRepository.findOne.mockResolvedValue(row);
      const builder = makeQueryBuilder();
      builder.getOne.mockResolvedValue(makeRow({ code: 'KG' })); // duplicate exists
      unitRepository.createQueryBuilder.mockReturnValue(builder);
      await expect(
        service.update(
          '1',
          { code: 'KG', updatedAt: '2026-08-04T00:00:00.000Z' } as any,
          'u',
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('deactivate / restore', () => {
    it('sets isActive=false on deactivate', async () => {
      const row = makeRow({ isActive: true });
      unitRepository.findOne.mockResolvedValue(row);
      unitRepository.save.mockImplementation(async (e: any) => e);
      const result = await service.deactivate('1', 'user-1');
      expect(result.isActive).toBe(false);
      expect(result.updatedBy).toBe('user-1');
    });

    it('sets isActive=true on restore', async () => {
      const row = makeRow({ isActive: false });
      unitRepository.findOne.mockResolvedValue(row);
      unitRepository.save.mockImplementation(async (e: any) => e);
      const result = await service.restore('1', 'user-1');
      expect(result.isActive).toBe(true);
    });

    it('throws NotFoundException when row missing', async () => {
      unitRepository.findOne.mockResolvedValue(null);
      await expect(service.deactivate('99', 'u')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('findAll', () => {
    it('applies search, isActive filter, and pagination metadata', async () => {
      const builder = makeQueryBuilder([makeRow()], 1);
      unitRepository.createQueryBuilder.mockReturnValue(builder);
      const result = await service.findAll({
        page: 1,
        limit: 20,
        search: 'PCS',
        isActive: true,
        sortBy: 'code',
        sortOrder: 'asc',
      } as any);
      expect(builder.andWhere).toHaveBeenCalled();
      expect(result.items).toHaveLength(1);
      expect(result.meta).toEqual({
        page: 1,
        limit: 20,
        totalItems: 1,
        totalPages: 1,
      });
    });

    it('defaults to ascending order on code', async () => {
      const builder = makeQueryBuilder([makeRow()], 1);
      unitRepository.createQueryBuilder.mockReturnValue(builder);
      await service.findAll({ page: 1, limit: 20 } as any);
      expect(builder.orderBy).toHaveBeenCalledWith('unit.code', 'ASC');
    });
  });

  describe('findOne', () => {
    it('returns the unit by id', async () => {
      unitRepository.findOne.mockResolvedValue(makeRow());
      const result = await service.findOne('1');
      expect(result.id).toBe('1');
    });

    it('throws NotFoundException when id is missing', async () => {
      unitRepository.findOne.mockResolvedValue(null);
      await expect(service.findOne('99')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
