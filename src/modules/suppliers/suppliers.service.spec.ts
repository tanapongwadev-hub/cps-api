import { Test, type TestingModule } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { SupplierMaterial } from '../../entities/master/supplier-material.entity';
import { Supplier } from '../../entities/master/supplier.entity';
import { SuppliersService } from './suppliers.service';

type SupplierRow = {
  id: string;
  code: string;
  nameTh: string;
  nameEn: string | null;
  taxId: string | null;
  contactName: string | null;
  telephone: string | null;
  email: string | null;
  address: string | null;
  isActive: boolean;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function makeRow(overrides: Partial<SupplierRow> = {}): SupplierRow {
  return {
    id: '1',
    code: 'SUP-001',
    nameTh: 'บริษัท ABC',
    nameEn: 'ABC Co.',
    taxId: '0105560001234',
    contactName: 'สมชาย',
    telephone: '02-123-4567',
    email: 'contact@abc.co.th',
    address: 'Bangkok',
    isActive: true,
    createdBy: '9',
    updatedBy: '9',
    createdAt: new Date('2026-08-04T00:00:00.000Z'),
    updatedAt: new Date('2026-08-04T00:00:00.000Z'),
    ...overrides,
  };
}

function makeQueryBuilder(rows: SupplierRow[] = [], total = rows.length) {
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

describe('SuppliersService', () => {
  let service: SuppliersService;
  let supplierRepository: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
    createQueryBuilder: jest.Mock;
    count: jest.Mock;
  };
  let dataSource: { transaction: jest.Mock };

  beforeEach(async () => {
    supplierRepository = {
      create: jest.fn((payload) => ({ ...payload })),
      save: jest.fn(async (entity) => entity),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(() => makeQueryBuilder()),
      count: jest.fn().mockResolvedValue(0),
    };
    dataSource = {
      transaction: jest.fn(async (cb) => {
        const manager = {
          getRepository: (entity: any) => {
            if (entity === SupplierMaterial) {
              return {
                count: supplierRepository.count,
                findOne: supplierRepository.findOne,
              };
            }
            return supplierRepository;
          },
        };
        return cb(manager);
      }),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        SuppliersService,
        { provide: getRepositoryToken(Supplier), useValue: supplierRepository },
        { provide: getDataSourceToken(), useValue: dataSource },
      ],
    }).compile();

    service = moduleRef.get(SuppliersService);
  });

  describe('create', () => {
    it('normalizes code, trims strings, saves audit ids', async () => {
      const result = await service.create(
        {
          code: ' sup-001 ',
          nameTh: ' บริษัท ABC ',
          nameEn: ' ABC Co. ',
        },
        'user-1',
      );
      expect(supplierRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'SUP-001',
          nameTh: 'บริษัท ABC',
          nameEn: 'ABC Co.',
          isActive: true,
          createdBy: 'user-1',
          updatedBy: 'user-1',
        }),
      );
      expect(result.code).toBe('SUP-001');
    });

    it('throws ConflictException on duplicate code', async () => {
      const builder = makeQueryBuilder();
      builder.getOne.mockResolvedValue(makeRow());
      supplierRepository.createQueryBuilder.mockReturnValue(builder);
      await expect(
        service.create({ code: 'SUP-001', nameTh: 'บริษัท' } as any, 'u'),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('update', () => {
    it('rejects with NotFound when id missing', async () => {
      supplierRepository.findOne.mockResolvedValue(null);
      await expect(
        service.update(
          '99',
          { updatedAt: new Date().toISOString() } as any,
          'u',
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects with ConflictException on stale updatedAt', async () => {
      const row = makeRow({
        updatedAt: new Date('2026-08-04T00:00:00.000Z'),
      });
      supplierRepository.findOne.mockResolvedValue(row);
      await expect(
        service.update(
          '1',
          { nameTh: 'x', updatedAt: '2026-01-01T00:00:00.000Z' } as any,
          'u',
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('applies update and stamps updatedBy', async () => {
      const row = makeRow({
        updatedAt: new Date('2026-08-04T00:00:00.000Z'),
      });
      supplierRepository.findOne.mockResolvedValue(row);
      supplierRepository.save.mockImplementation(async (e: any) => e);
      const result = await service.update(
        '1',
        {
          nameTh: 'บริษัท XYZ',
          updatedAt: '2026-08-04T00:00:00.000Z',
        },
        'user-2',
      );
      expect(result.nameTh).toBe('บริษัท XYZ');
      expect(result.updatedBy).toBe('user-2');
    });
  });

  describe('deactivate', () => {
    it('rejects with UnprocessableEntityException when active supplier_materials exist', async () => {
      const row = makeRow({ isActive: true });
      supplierRepository.findOne.mockResolvedValue(row);
      supplierRepository.count.mockResolvedValue(3);
      await expect(service.deactivate('1', 'u')).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });

    it('sets isActive=false when no active references', async () => {
      const row = makeRow({ isActive: true });
      supplierRepository.findOne.mockResolvedValue(row);
      supplierRepository.save.mockImplementation(async (e: any) => e);
      const result = await service.deactivate('1', 'user-1');
      expect(result.isActive).toBe(false);
    });

    it('throws NotFoundException when row missing', async () => {
      supplierRepository.findOne.mockResolvedValue(null);
      await expect(service.deactivate('99', 'u')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('restore', () => {
    it('sets isActive=true', async () => {
      const row = makeRow({ isActive: false });
      supplierRepository.findOne.mockResolvedValue(row);
      supplierRepository.save.mockImplementation(async (e: any) => e);
      const result = await service.restore('1', 'user-1');
      expect(result.isActive).toBe(true);
    });
  });

  describe('findAll / findOne', () => {
    it('applies search/filter/pagination', async () => {
      const builder = makeQueryBuilder([makeRow()], 1);
      supplierRepository.createQueryBuilder.mockReturnValue(builder);
      const result = await service.findAll({
        page: 1,
        limit: 20,
        search: 'ABC',
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

    it('returns the supplier by id', async () => {
      supplierRepository.findOne.mockResolvedValue(makeRow());
      const result = await service.findOne('1');
      expect(result.id).toBe('1');
    });
  });
});
