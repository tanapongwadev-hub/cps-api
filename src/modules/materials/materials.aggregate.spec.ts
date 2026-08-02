import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { DeliveryType } from '../../entities/master/delivery-type.entity';
import { LoadingPoint } from '../../entities/master/loading-point.entity';
import { MaterialModel } from '../../entities/master/material-model.entity';
import { Material } from '../../entities/master/material.entity';
import { SupplierMaterial } from '../../entities/master/supplier-material.entity';
import { Supplier } from '../../entities/master/supplier.entity';
import { Unit } from '../../entities/master/unit.entity';
import { CreateMaterialDto } from './dto/create-material.dto';
import { MaterialsService } from './materials.service';

type RepositoryStub<T extends object> = Partial<
  Record<keyof Repository<T>, jest.Mock>
>;

function repositoryStub<T extends object>(): RepositoryStub<T> {
  return {
    create: jest.fn((value: T) => value),
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn((value: T) => Promise.resolve(value)),
    createQueryBuilder: jest.fn(),
  };
}

function detailBuilder(material: Material) {
  return {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(material),
  };
}

describe('MaterialsService aggregate commands', () => {
  let rootMaterials: RepositoryStub<Material>;
  let rootUnits: RepositoryStub<Unit>;
  let rootSuppliers: RepositoryStub<Supplier>;
  let rootModels: RepositoryStub<MaterialModel>;
  let rootDeliveryTypes: RepositoryStub<DeliveryType>;
  let rootLoadingPoints: RepositoryStub<LoadingPoint>;
  let materials: RepositoryStub<Material>;
  let units: RepositoryStub<Unit>;
  let suppliers: RepositoryStub<Supplier>;
  let models: RepositoryStub<MaterialModel>;
  let deliveryTypes: RepositoryStub<DeliveryType>;
  let loadingPoints: RepositoryStub<LoadingPoint>;
  let supplierMaterials: RepositoryStub<SupplierMaterial>;
  let transaction: jest.Mock;
  let service: MaterialsService;
  let savedMaterialWrites: Material[];
  let savedMappingBatches: SupplierMaterial[][];

  const activeUnit = { id: '1', code: 'KG', isActive: true } as Unit;
  const activeSupplier = (id: string) =>
    ({ id, code: `SUP-${id}`, isActive: true }) as Supplier;
  const timestamp = new Date('2026-08-01T10:00:00.000Z');
  const createDto = (): CreateMaterialDto => ({
    code: ' mat-001 ',
    name: 'Steel coil',
    unitId: '1',
    deliveryTypeId: null,
    modelId: null,
    loadingPointId: null,
    supplierIds: ['10', '11'],
    isActive: true,
  });

  beforeEach(() => {
    rootMaterials = repositoryStub<Material>();
    rootUnits = repositoryStub<Unit>();
    rootSuppliers = repositoryStub<Supplier>();
    rootModels = repositoryStub<MaterialModel>();
    rootDeliveryTypes = repositoryStub<DeliveryType>();
    rootLoadingPoints = repositoryStub<LoadingPoint>();
    materials = repositoryStub<Material>();
    units = repositoryStub<Unit>();
    suppliers = repositoryStub<Supplier>();
    models = repositoryStub<MaterialModel>();
    deliveryTypes = repositoryStub<DeliveryType>();
    loadingPoints = repositoryStub<LoadingPoint>();
    supplierMaterials = repositoryStub<SupplierMaterial>();
    savedMaterialWrites = [];
    savedMappingBatches = [];

    const manager = {
      getRepository: (entity: unknown) => {
        if (entity === Material) return materials;
        if (entity === Unit) return units;
        if (entity === Supplier) return suppliers;
        if (entity === MaterialModel) return models;
        if (entity === DeliveryType) return deliveryTypes;
        if (entity === LoadingPoint) return loadingPoints;
        if (entity === SupplierMaterial) return supplierMaterials;
        throw new Error('Unexpected repository');
      },
    };
    transaction = jest.fn((callback: (value: unknown) => Promise<unknown>) =>
      callback(manager),
    );
    service = new MaterialsService(
      rootMaterials as unknown as Repository<Material>,
      rootUnits as unknown as Repository<Unit>,
      rootSuppliers as unknown as Repository<Supplier>,
      rootModels as unknown as Repository<MaterialModel>,
      rootDeliveryTypes as unknown as Repository<DeliveryType>,
      rootLoadingPoints as unknown as Repository<LoadingPoint>,
      { transaction } as unknown as DataSource,
    );

    units.findOne!.mockResolvedValue(activeUnit);
    suppliers.find!.mockResolvedValue([
      activeSupplier('10'),
      activeSupplier('11'),
    ]);
    materials.findOne!.mockResolvedValue(null);
    materials.save!.mockImplementation((value: Material) => {
      value.id ??= '20';
      value.updatedAt ??= timestamp;
      savedMaterialWrites.push(value);
      return Promise.resolve(value);
    });
    supplierMaterials.save!.mockImplementation(
      (value: SupplierMaterial | SupplierMaterial[]) => {
        if (Array.isArray(value)) savedMappingBatches.push(value);
        return Promise.resolve(value);
      },
    );
    supplierMaterials.find!.mockResolvedValue([]);
  });

  it('creates the material and supplier aggregate atomically with normalized code and audit IDs', async () => {
    const returned = {
      id: '20',
      code: 'MAT-001',
      name: 'Steel coil',
      isActive: true,
      supplierMaterials: [
        {
          isActive: true,
          supplier: activeSupplier('10'),
        } as SupplierMaterial,
        {
          isActive: true,
          supplier: activeSupplier('11'),
        } as SupplierMaterial,
      ],
    } as Material;
    rootMaterials.createQueryBuilder!.mockReturnValue(detailBuilder(returned));

    const result = await service.create(createDto(), '7');

    expect(result).toMatchObject({
      id: '20',
      code: 'MAT-001',
      suppliers: [{ id: '10' }, { id: '11' }],
    });
    const [savedMaterial] = savedMaterialWrites;
    expect(savedMaterial).toMatchObject({
      code: 'MAT-001',
      createdBy: '7',
      updatedBy: '7',
    });
    const [savedMappings] = savedMappingBatches;
    expect(savedMappings).toEqual([
      expect.objectContaining({
        materialId: '20',
        supplierId: '10',
        isActive: true,
        createdBy: '7',
        updatedBy: '7',
      }),
      expect.objectContaining({
        materialId: '20',
        supplierId: '11',
        isActive: true,
        createdBy: '7',
        updatedBy: '7',
      }),
    ]);
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('rejects a missing required lookup and an inactive optional lookup', async () => {
    units.findOne!.mockResolvedValueOnce(null);

    await expect(service.create(createDto(), '7')).rejects.toBeInstanceOf(
      NotFoundException,
    );

    units.findOne!.mockResolvedValueOnce(activeUnit);
    deliveryTypes.findOne!.mockResolvedValueOnce({
      id: '3',
      isActive: false,
    });
    await expect(
      service.create({ ...createDto(), deliveryTypeId: '3' }, '7'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(materials.save).not.toHaveBeenCalled();
  });

  it('defends against duplicate and invalid supplier IDs before writing', async () => {
    await expect(
      service.create({ ...createDto(), supplierIds: ['10', '10'] }, '7'),
    ).rejects.toBeInstanceOf(BadRequestException);

    suppliers.find!.mockResolvedValueOnce([activeSupplier('10')]);
    await expect(
      service.create({ ...createDto(), supplierIds: ['10', '999'] }, '7'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(materials.save).not.toHaveBeenCalled();
  });

  it('rejects an existing code without regard to case', async () => {
    materials.findOne!.mockResolvedValueOnce({
      id: '99',
      code: 'MAT-001',
    });

    await expect(service.create(createDto(), '7')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(materials.save).not.toHaveBeenCalled();
  });

  it('maps a database material-code unique violation to conflict', async () => {
    materials.save!.mockRejectedValueOnce({
      driverError: { code: '23505', constraint: 'uq_materials_code_ci' },
    });

    await expect(service.create(createDto(), '7')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('updates fields and synchronizes supplier insert, reactivate, keep, and deactivate states', async () => {
    const locked = {
      id: '20',
      code: 'MAT-001',
      name: 'Old name',
      unitId: '1',
      deliveryTypeId: null,
      modelId: null,
      loadingPointId: null,
      updatedAt: timestamp,
    } as Material;
    const kept = {
      id: '100',
      materialId: '20',
      supplierId: '10',
      isActive: true,
      updatedBy: '2',
    } as SupplierMaterial;
    const reactivated = {
      id: '101',
      materialId: '20',
      supplierId: '11',
      isActive: false,
      updatedBy: '2',
    } as SupplierMaterial;
    const removed = {
      id: '102',
      materialId: '20',
      supplierId: '12',
      isActive: true,
      updatedBy: '2',
    } as SupplierMaterial;
    materials
      .findOne!.mockResolvedValueOnce(locked)
      .mockResolvedValueOnce(null);
    suppliers.find!.mockResolvedValue([
      activeSupplier('10'),
      activeSupplier('11'),
      activeSupplier('13'),
    ]);
    supplierMaterials.find!.mockResolvedValue([kept, reactivated, removed]);
    rootMaterials.createQueryBuilder!.mockReturnValue(
      detailBuilder({
        ...locked,
        code: 'MAT-002',
        name: 'New name',
        supplierMaterials: [],
      }),
    );

    const result = await service.update(
      '20',
      {
        code: 'mat-002',
        name: 'New name',
        supplierIds: ['10', '11', '13'],
        updatedAt: timestamp.toISOString(),
      },
      '7',
    );

    expect(result).toMatchObject({ code: 'MAT-002', name: 'New name' });
    expect(locked).toMatchObject({
      code: 'MAT-002',
      name: 'New name',
      updatedBy: '7',
    });
    expect(kept).toMatchObject({ isActive: true, updatedBy: '2' });
    expect(reactivated).toMatchObject({ isActive: true, updatedBy: '7' });
    expect(removed).toMatchObject({ isActive: false, updatedBy: '7' });
    expect(savedMappingBatches[0]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ supplierId: '13', isActive: true }),
      ]),
    );
  });

  it('rejects a stale update before validating or changing aggregate state', async () => {
    const locked = {
      id: '20',
      code: 'MAT-001',
      name: 'Old name',
      updatedAt: timestamp,
    } as Material;
    materials.findOne!.mockResolvedValueOnce(locked);

    await expect(
      service.update(
        '20',
        {
          name: 'Stale name',
          supplierIds: ['10'],
          updatedAt: '2026-07-31T10:00:00.000Z',
        },
        '7',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(locked.name).toBe('Old name');
    expect(units.findOne).not.toHaveBeenCalled();
    expect(supplierMaterials.save).not.toHaveBeenCalled();
  });

  it('locks updates and propagates a supplier write failure through the transaction', async () => {
    const locked = {
      id: '20',
      code: 'MAT-001',
      unitId: '1',
      deliveryTypeId: null,
      modelId: null,
      loadingPointId: null,
      updatedAt: timestamp,
    } as Material;
    materials.findOne!.mockResolvedValueOnce(locked);
    suppliers.find!.mockResolvedValueOnce([activeSupplier('10')]);
    supplierMaterials.find!.mockResolvedValueOnce([]);
    supplierMaterials.save!.mockRejectedValueOnce(new Error('mapping failed'));

    await expect(
      service.update(
        '20',
        { supplierIds: ['10'], updatedAt: timestamp.toISOString() },
        '7',
      ),
    ).rejects.toThrow('mapping failed');
    expect(materials.findOne).toHaveBeenCalledWith({
      where: { id: '20' },
      lock: { mode: 'pessimistic_write' },
    });
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('soft-deactivates without changing supplier relationships and restores them later', async () => {
    const material = {
      id: '20',
      code: 'MAT-001',
      isActive: true,
      updatedAt: timestamp,
    } as Material;
    materials.findOne!.mockResolvedValue(material);
    rootMaterials.createQueryBuilder!.mockReturnValue(
      detailBuilder({ ...material, supplierMaterials: [] }),
    );

    await service.deactivate('20', '7');
    expect(material).toMatchObject({ isActive: false, updatedBy: '7' });
    expect(supplierMaterials.find).not.toHaveBeenCalled();
    expect(supplierMaterials.save).not.toHaveBeenCalled();

    await service.restore('20', '8');
    expect(material).toMatchObject({ isActive: true, updatedBy: '8' });
    expect(supplierMaterials.save).not.toHaveBeenCalled();
    expect(transaction).toHaveBeenCalledTimes(2);
  });

  it.each([
    [
      'update',
      () => service.update('404', { updatedAt: timestamp.toISOString() }, '7'),
    ],
    ['deactivate', () => service.deactivate('404', '7')],
    ['restore', () => service.restore('404', '7')],
  ])(
    'returns not found when %s targets an absent material',
    async (_name, command) => {
      materials.findOne!.mockResolvedValueOnce(null);

      await expect(command()).rejects.toBeInstanceOf(NotFoundException);
      expect(materials.save).not.toHaveBeenCalled();
    },
  );
});
