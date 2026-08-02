import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DeliveryType } from '../../entities/master/delivery-type.entity';
import { LoadingPoint } from '../../entities/master/loading-point.entity';
import { MaterialModel } from '../../entities/master/material-model.entity';
import { Material } from '../../entities/master/material.entity';
import { Supplier } from '../../entities/master/supplier.entity';
import { Unit } from '../../entities/master/unit.entity';
import { ListMaterialsQueryDto } from './dto/list-materials-query.dto';
import { MaterialsService } from './materials.service';

type RepositoryStub<T extends object> = Partial<
  Record<keyof Repository<T>, jest.Mock>
>;

function repositoryStub<T extends object>(): RepositoryStub<T> {
  return {
    createQueryBuilder: jest.fn(),
    find: jest.fn(),
  };
}

function queryBuilderStub() {
  return {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn(),
    getOne: jest.fn(),
  };
}

describe('MaterialsService read operations', () => {
  let materials: RepositoryStub<Material>;
  let units: RepositoryStub<Unit>;
  let suppliers: RepositoryStub<Supplier>;
  let models: RepositoryStub<MaterialModel>;
  let deliveryTypes: RepositoryStub<DeliveryType>;
  let loadingPoints: RepositoryStub<LoadingPoint>;
  let service: MaterialsService;

  beforeEach(() => {
    materials = repositoryStub<Material>();
    units = repositoryStub<Unit>();
    suppliers = repositoryStub<Supplier>();
    models = repositoryStub<MaterialModel>();
    deliveryTypes = repositoryStub<DeliveryType>();
    loadingPoints = repositoryStub<LoadingPoint>();
    service = new MaterialsService(
      materials as unknown as Repository<Material>,
      units as unknown as Repository<Unit>,
      suppliers as unknown as Repository<Supplier>,
      models as unknown as Repository<MaterialModel>,
      deliveryTypes as unknown as Repository<DeliveryType>,
      loadingPoints as unknown as Repository<LoadingPoint>,
    );
  });

  it('applies all filters, safe sorting, pagination, and maps active suppliers', async () => {
    const builder = queryBuilderStub();
    const activeSupplier = {
      id: '5',
      code: 'SUP-005',
      nameTh: 'Supplier Five',
      isActive: true,
    } as Supplier;
    const inactiveSupplier = {
      id: '6',
      code: 'SUP-006',
      nameTh: 'Supplier Six',
      isActive: false,
    } as Supplier;
    const material = {
      id: '11',
      code: 'MAT-011',
      name: 'Steel coil',
      isActive: false,
      supplierMaterials: [
        { isActive: true, supplier: activeSupplier },
        { isActive: false, supplier: inactiveSupplier },
        { isActive: true, supplier: inactiveSupplier },
      ],
    } as Material;
    builder.getManyAndCount.mockResolvedValue([[material], 21]);
    materials.createQueryBuilder!.mockReturnValue(builder);

    const result = await service.findAll({
      page: 2,
      limit: 10,
      search: 'Steel',
      isActive: false,
      unitId: '1',
      modelId: '2',
      deliveryTypeId: '3',
      loadingPointId: '4',
      supplierId: '5',
      sortBy: 'name',
      sortOrder: 'desc',
    });

    expect(result).toEqual({
      items: [
        expect.objectContaining({
          id: '11',
          code: 'MAT-011',
          suppliers: [activeSupplier],
        }),
      ],
      meta: { page: 2, limit: 10, totalItems: 21, totalPages: 3 },
    });
    expect(result.items[0]).not.toHaveProperty('supplierMaterials');
    expect(builder.leftJoinAndSelect).toHaveBeenCalledWith(
      'material.supplierMaterials',
      'supplierMaterial',
      'supplierMaterial.isActive = :supplierMaterialIsActive',
      { supplierMaterialIsActive: true },
    );
    expect(builder.leftJoinAndSelect).toHaveBeenCalledWith(
      'supplierMaterial.supplier',
      'supplier',
      'supplier.isActive = :supplierIsActive',
      { supplierIsActive: true },
    );
    expect(builder.andWhere).toHaveBeenCalledWith(
      '(material.code ILIKE :search OR material.name ILIKE :search)',
      { search: '%Steel%' },
    );
    for (const [condition, value] of [
      ['material.isActive = :isActive', false],
      ['material.unitId = :unitId', '1'],
      ['material.modelId = :modelId', '2'],
      ['material.deliveryTypeId = :deliveryTypeId', '3'],
      ['material.loadingPointId = :loadingPointId', '4'],
    ] as const) {
      expect(builder.andWhere).toHaveBeenCalledWith(condition, {
        [condition.split(':')[1]]: value,
      });
    }
    expect(builder.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('supplier_filter.supplier_id = :supplierId'),
      { supplierId: '5' },
    );
    expect(builder.orderBy).toHaveBeenCalledWith('material.name', 'DESC');
    expect(builder.addOrderBy).toHaveBeenCalledWith('material.id', 'ASC');
    expect(builder.skip).toHaveBeenCalledWith(10);
    expect(builder.take).toHaveBeenCalledWith(10);
  });

  it('falls back to the fixed code sort when called with arbitrary input', async () => {
    const builder = queryBuilderStub();
    builder.getManyAndCount.mockResolvedValue([[], 0]);
    materials.createQueryBuilder!.mockReturnValue(builder);

    const unsafeQuery = new ListMaterialsQueryDto();
    Reflect.set(
      unsafeQuery,
      'sortBy',
      'material.name; DROP TABLE master.materials',
    );

    await service.findAll(unsafeQuery);

    expect(builder.orderBy).toHaveBeenCalledWith('material.code', 'ASC');
  });

  it('returns one inactive material for editing with mapped active suppliers', async () => {
    const builder = queryBuilderStub();
    const supplier = {
      id: '5',
      code: 'SUP-005',
      isActive: true,
    } as Supplier;
    builder.getOne.mockResolvedValue({
      id: '11',
      code: 'MAT-011',
      isActive: false,
      supplierMaterials: [{ isActive: true, supplier }],
    });
    materials.createQueryBuilder!.mockReturnValue(builder);

    await expect(service.findOne('11')).resolves.toEqual(
      expect.objectContaining({
        id: '11',
        isActive: false,
        suppliers: [supplier],
      }),
    );
    expect(builder.where).toHaveBeenCalledWith('material.id = :id', {
      id: '11',
    });
    expect(builder.andWhere).not.toHaveBeenCalledWith(
      'material.isActive = :isActive',
      expect.anything(),
    );
  });

  it('throws when material detail is absent', async () => {
    const builder = queryBuilderStub();
    builder.getOne.mockResolvedValue(null);
    materials.createQueryBuilder!.mockReturnValue(builder);

    await expect(service.findOne('999')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('returns active lookups sorted by code', async () => {
    units.find!.mockResolvedValue([{ id: '1', code: 'KG' }]);
    suppliers.find!.mockResolvedValue([{ id: '2', code: 'SUP-002' }]);
    models.find!.mockResolvedValue([{ id: '3', code: 'MODEL-3' }]);
    deliveryTypes.find!.mockResolvedValue([{ id: '4', code: 'TRUCK' }]);
    loadingPoints.find!.mockResolvedValue([{ id: '5', code: 'DOCK-1' }]);

    await expect(service.getLookups()).resolves.toEqual({
      units: [{ id: '1', code: 'KG' }],
      suppliers: [{ id: '2', code: 'SUP-002' }],
      models: [{ id: '3', code: 'MODEL-3' }],
      deliveryTypes: [{ id: '4', code: 'TRUCK' }],
      loadingPoints: [{ id: '5', code: 'DOCK-1' }],
    });

    for (const repository of [
      units,
      suppliers,
      models,
      deliveryTypes,
      loadingPoints,
    ]) {
      expect(repository.find).toHaveBeenCalledWith({
        where: { isActive: true },
        order: { code: 'ASC' },
      });
    }
  });
});
