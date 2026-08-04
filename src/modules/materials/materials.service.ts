import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, SelectQueryBuilder } from 'typeorm';
import { DeliveryType } from '../../entities/master/delivery-type.entity';
import { LoadingPoint } from '../../entities/master/loading-point.entity';
import { MaterialModel } from '../../entities/master/material-model.entity';
import { Material } from '../../entities/master/material.entity';
import { SupplierMaterial } from '../../entities/master/supplier-material.entity';
import { Supplier } from '../../entities/master/supplier.entity';
import { Unit } from '../../entities/master/unit.entity';
import { CreateMaterialDto } from './dto/create-material.dto';
import {
  ListMaterialsQueryDto,
  MaterialSortBy,
} from './dto/list-materials-query.dto';
import { UpdateMaterialDto } from './dto/update-material.dto';
import { MaterialImageStorageService } from './material-image-storage.service';

const MATERIAL_SORT_COLUMNS: Record<MaterialSortBy, string> = {
  code: 'material.code',
  name: 'material.name',
  isActive: 'material.isActive',
  createdAt: 'material.createdAt',
  updatedAt: 'material.updatedAt',
};

export interface MaterialLookupResponse {
  id: string;
  code: string;
  isActive?: boolean;
  nameTh?: string;
  nameEn?: string | null;
  symbol?: string | null;
  description?: string | null;
}

export type MaterialWithSuppliers = Omit<
  Material,
  'supplierMaterials' | 'unit' | 'model' | 'deliveryType' | 'loadingPoint'
> & {
  unit?: MaterialLookupResponse | null;
  model?: MaterialLookupResponse | null;
  deliveryType?: MaterialLookupResponse | null;
  loadingPoint?: MaterialLookupResponse | null;
  suppliers: MaterialLookupResponse[];
};

type MasterLookupEntity =
  Unit | Supplier | MaterialModel | DeliveryType | LoadingPoint;

@Injectable()
export class MaterialsService {
  private readonly logger = new Logger(MaterialsService.name);

  constructor(
    @InjectRepository(Material)
    private materialRepository: Repository<Material>,
    @InjectRepository(Unit)
    private unitRepository: Repository<Unit>,
    @InjectRepository(Supplier)
    private supplierRepository: Repository<Supplier>,
    @InjectRepository(MaterialModel)
    private modelRepository: Repository<MaterialModel>,
    @InjectRepository(DeliveryType)
    private deliveryTypeRepository: Repository<DeliveryType>,
    @InjectRepository(LoadingPoint)
    private loadingPointRepository: Repository<LoadingPoint>,
    private dataSource?: DataSource,
    private imageStorage?: MaterialImageStorageService,
  ) {}

  async create(
    dto: CreateMaterialDto,
    userId: string,
  ): Promise<MaterialWithSuppliers> {
    this.assertUniqueSupplierIds(dto.supplierIds);
    let promotedImagePath: string | undefined;
    try {
      return await this.getDataSource().transaction(async (manager) => {
        const materialRepository = manager.getRepository(Material);
        const unitRepository = manager.getRepository(Unit);
        const supplierRepository = manager.getRepository(Supplier);
        const modelRepository = manager.getRepository(MaterialModel);
        const deliveryTypeRepository = manager.getRepository(DeliveryType);
        const loadingPointRepository = manager.getRepository(LoadingPoint);
        const supplierMaterialRepository =
          manager.getRepository(SupplierMaterial);
        const normalizedCode = this.normalizeCode(dto.code);

        await this.assertCodeAvailable(materialRepository, normalizedCode);
        await this.validateReferences(
          {
            unitId: dto.unitId,
            deliveryTypeId: dto.deliveryTypeId ?? null,
            modelId: dto.modelId ?? null,
            loadingPointId: dto.loadingPointId ?? null,
            supplierIds: dto.supplierIds,
          },
          {
            unitRepository,
            supplierRepository,
            modelRepository,
            deliveryTypeRepository,
            loadingPointRepository,
          },
        );
        if (dto.imagePath) {
          promotedImagePath = await this.getImageStorage().promote(
            dto.imagePath,
          );
        }

        const material = materialRepository.create({
          code: normalizedCode,
          name: dto.name,
          unitId: dto.unitId,
          deliveryTypeId: dto.deliveryTypeId ?? null,
          modelId: dto.modelId ?? null,
          loadingPointId: dto.loadingPointId ?? null,
          processLineName: dto.processLineName ?? null,
          scale: dto.scale ?? null,
          imagePath: promotedImagePath ?? null,
          specification: dto.specification ?? null,
          description: dto.description ?? null,
          isActive: dto.isActive ?? true,
          createdBy: userId,
          updatedBy: userId,
        });
        const savedMaterial = await this.saveMaterial(
          materialRepository,
          material,
        );

        const mappings = (dto.supplierIds ?? []).map((supplierId) =>
          supplierMaterialRepository.create({
            materialId: savedMaterial.id,
            supplierId,
            isActive: true,
            createdBy: userId,
            updatedBy: userId,
          }),
        );
        if (mappings.length > 0) {
          await this.saveSupplierMaterials(
            supplierMaterialRepository,
            mappings,
          );
        }

        return this.findOneUsing(materialRepository, savedMaterial.id);
      });
    } catch (error) {
      await this.compensatePromotedImage(promotedImagePath);
      throw error;
    }
  }

  async update(
    id: string,
    dto: UpdateMaterialDto,
    userId: string,
  ): Promise<MaterialWithSuppliers> {
    this.assertUniqueSupplierIds(dto.supplierIds);
    let promotedImagePath: string | undefined;
    let previousImagePath: string | null | undefined;
    let imageChanged = false;
    let result: MaterialWithSuppliers;
    try {
      result = await this.getDataSource().transaction(async (manager) => {
        const materialRepository = manager.getRepository(Material);
        const unitRepository = manager.getRepository(Unit);
        const supplierRepository = manager.getRepository(Supplier);
        const modelRepository = manager.getRepository(MaterialModel);
        const deliveryTypeRepository = manager.getRepository(DeliveryType);
        const loadingPointRepository = manager.getRepository(LoadingPoint);
        const supplierMaterialRepository =
          manager.getRepository(SupplierMaterial);
        const material = await materialRepository.findOne({
          where: { id },
          lock: { mode: 'pessimistic_write' },
        });

        if (!material) {
          throw new NotFoundException('Material not found');
        }
        if (
          new Date(dto.updatedAt).getTime() !==
          new Date(material.updatedAt).getTime()
        ) {
          throw new ConflictException('Material has been updated');
        }

        const normalizedCode = dto.code
          ? this.normalizeCode(dto.code)
          : material.code;
        if (dto.code) {
          await this.assertCodeAvailable(
            materialRepository,
            normalizedCode,
            material.id,
          );
        }
        await this.validateReferences(
          {
            unitId: dto.unitId ?? material.unitId,
            deliveryTypeId:
              dto.deliveryTypeId === undefined
                ? material.deliveryTypeId
                : dto.deliveryTypeId,
            modelId: dto.modelId === undefined ? material.modelId : dto.modelId,
            loadingPointId:
              dto.loadingPointId === undefined
                ? material.loadingPointId
                : dto.loadingPointId,
            supplierIds: dto.supplierIds,
          },
          {
            unitRepository,
            supplierRepository,
            modelRepository,
            deliveryTypeRepository,
            loadingPointRepository,
          },
        );

        let effectiveDto = dto;
        if (dto.imagePath !== undefined) {
          previousImagePath = material.imagePath;
          imageChanged = dto.imagePath !== material.imagePath;
          if (imageChanged && dto.imagePath !== null) {
            promotedImagePath = await this.getImageStorage().promote(
              dto.imagePath,
            );
            effectiveDto = { ...dto, imagePath: promotedImagePath };
          }
        }

        this.applyUpdate(material, effectiveDto, normalizedCode, userId);
        await this.saveMaterial(materialRepository, material);
        if (dto.supplierIds !== undefined) {
          await this.synchronizeSuppliers(
            supplierMaterialRepository,
            material.id,
            dto.supplierIds,
            userId,
          );
        }
        return this.findOneUsing(materialRepository, material.id);
      });
    } catch (error) {
      await this.compensatePromotedImage(promotedImagePath);
      throw error;
    }

    if (
      imageChanged &&
      previousImagePath &&
      previousImagePath !== result.imagePath
    ) {
      await this.discardCommittedImage(previousImagePath);
    }
    return result;
  }

  async deactivate(id: string, userId: string): Promise<MaterialWithSuppliers> {
    return this.setActive(id, false, userId);
  }

  async restore(id: string, userId: string): Promise<MaterialWithSuppliers> {
    return this.setActive(id, true, userId);
  }

  async findAll(query: ListMaterialsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const queryBuilder = this.createReadQuery();

    if (query.search) {
      queryBuilder.andWhere(
        '(material.code ILIKE :search OR material.name ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }
    if (query.isActive !== undefined) {
      queryBuilder.andWhere('material.isActive = :isActive', {
        isActive: query.isActive,
      });
    }
    if (query.unitId) {
      queryBuilder.andWhere('material.unitId = :unitId', {
        unitId: query.unitId,
      });
    }
    if (query.modelId) {
      queryBuilder.andWhere('material.modelId = :modelId', {
        modelId: query.modelId,
      });
    }
    if (query.deliveryTypeId) {
      queryBuilder.andWhere('material.deliveryTypeId = :deliveryTypeId', {
        deliveryTypeId: query.deliveryTypeId,
      });
    }
    if (query.loadingPointId) {
      queryBuilder.andWhere('material.loadingPointId = :loadingPointId', {
        loadingPointId: query.loadingPointId,
      });
    }
    if (query.supplierId) {
      queryBuilder.andWhere(
        `EXISTS (
          SELECT 1
          FROM master.supplier_materials supplier_filter
          INNER JOIN master.suppliers supplier_filter_supplier
            ON supplier_filter_supplier.id = supplier_filter.supplier_id
          WHERE supplier_filter.material_id = material.id
            AND supplier_filter.supplier_id = :supplierId
            AND supplier_filter.is_active = TRUE
            AND supplier_filter_supplier.is_active = TRUE
        )`,
        { supplierId: query.supplierId },
      );
    }

    const sortColumn =
      MATERIAL_SORT_COLUMNS[query.sortBy] ?? MATERIAL_SORT_COLUMNS.code;
    const sortOrder = query.sortOrder === 'desc' ? 'DESC' : 'ASC';
    const [materials, totalItems] = await queryBuilder
      .orderBy(sortColumn, sortOrder)
      .addOrderBy('material.id', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      items: materials.map((material) => this.mapSuppliers(material)),
      meta: {
        page,
        limit,
        totalItems,
        totalPages: Math.ceil(totalItems / limit),
      },
    };
  }

  async findOne(id: string): Promise<MaterialWithSuppliers> {
    return this.findOneUsing(this.materialRepository, id);
  }

  private async findOneUsing(
    repository: Repository<Material>,
    id: string,
  ): Promise<MaterialWithSuppliers> {
    const material = await this.createReadQuery(repository)
      .where('material.id = :id', { id })
      .getOne();

    if (!material) {
      throw new NotFoundException('Material not found');
    }

    return this.mapSuppliers(material);
  }

  async getLookups() {
    const lookupOptions = {
      where: { isActive: true },
      order: { code: 'ASC' as const },
    };
    const [units, suppliers, models, deliveryTypes, loadingPoints] =
      await Promise.all([
        this.unitRepository.find(lookupOptions),
        this.supplierRepository.find(lookupOptions),
        this.modelRepository.find(lookupOptions),
        this.deliveryTypeRepository.find(lookupOptions),
        this.loadingPointRepository.find(lookupOptions),
      ]);

    return {
      units: units.map((unit) => this.mapLookup(unit)),
      suppliers: suppliers.map((supplier) => this.mapLookup(supplier)),
      models: models.map((model) => this.mapLookup(model)),
      deliveryTypes: deliveryTypes.map((deliveryType) =>
        this.mapLookup(deliveryType),
      ),
      loadingPoints: loadingPoints.map((loadingPoint) =>
        this.mapLookup(loadingPoint),
      ),
    };
  }

  private createReadQuery(
    repository: Repository<Material> = this.materialRepository,
  ): SelectQueryBuilder<Material> {
    return repository
      .createQueryBuilder('material')
      .leftJoinAndSelect('material.unit', 'unit')
      .leftJoinAndSelect('material.model', 'model')
      .leftJoinAndSelect('material.deliveryType', 'deliveryType')
      .leftJoinAndSelect('material.loadingPoint', 'loadingPoint')
      .leftJoinAndSelect(
        'material.supplierMaterials',
        'supplierMaterial',
        'supplierMaterial.isActive = :supplierMaterialIsActive',
        { supplierMaterialIsActive: true },
      )
      .leftJoinAndSelect(
        'supplierMaterial.supplier',
        'supplier',
        'supplier.isActive = :supplierIsActive',
        { supplierIsActive: true },
      );
  }

  private mapSuppliers(material: Material): MaterialWithSuppliers {
    const suppliers = (material.supplierMaterials ?? [])
      .filter(
        (supplierMaterial: SupplierMaterial) =>
          supplierMaterial.isActive && supplierMaterial.supplier?.isActive,
      )
      .map((supplierMaterial) => supplierMaterial.supplier)
      .sort((first, second) => first.code.localeCompare(second.code))
      .map((supplier) => this.mapLookup(supplier));

    const result: Record<string, unknown> = {};
    for (const field of [
      'id',
      'code',
      'name',
      'unitId',
      'deliveryTypeId',
      'modelId',
      'loadingPointId',
      'processLineName',
      'scale',
      'imagePath',
      'specification',
      'description',
      'isActive',
      'createdBy',
      'updatedBy',
      'createdAt',
      'updatedAt',
    ] as const) {
      if (field in material) {
        result[field] = material[field];
      }
    }

    for (const field of [
      'unit',
      'model',
      'deliveryType',
      'loadingPoint',
    ] as const) {
      if (field in material) {
        const lookup = material[field];
        result[field] = lookup ? this.mapLookup(lookup) : null;
      }
    }
    result.suppliers = suppliers;
    return result as MaterialWithSuppliers;
  }

  private mapLookup(entity: MasterLookupEntity): MaterialLookupResponse {
    const result: Record<string, unknown> = {
      id: entity.id,
      code: entity.code,
    };
    for (const field of [
      'isActive',
      'nameTh',
      'nameEn',
      'symbol',
      'description',
    ] as const) {
      if (field in entity) {
        result[field] = Reflect.get(entity, field);
      }
    }
    return result as unknown as MaterialLookupResponse;
  }

  private getDataSource(): DataSource {
    if (!this.dataSource) {
      throw new Error('MaterialsService DataSource is not configured');
    }
    return this.dataSource;
  }

  private getImageStorage(): MaterialImageStorageService {
    if (!this.imageStorage) {
      throw new Error('MaterialsService image storage is not configured');
    }
    return this.imageStorage;
  }

  private async compensatePromotedImage(imagePath?: string): Promise<void> {
    if (!imagePath) return;
    try {
      await this.getImageStorage().discard(imagePath);
    } catch (error) {
      this.logger.error(
        `Failed to compensate Material image ${imagePath}`,
        error,
      );
    }
  }

  private async discardCommittedImage(imagePath: string): Promise<void> {
    try {
      await this.getImageStorage().discard(imagePath);
    } catch (error) {
      this.logger.warn(`Failed to discard Material image ${imagePath}`, error);
    }
  }

  private normalizeCode(code: string): string {
    return code.trim().toUpperCase();
  }

  private assertUniqueSupplierIds(supplierIds?: string[]): void {
    if (supplierIds && new Set(supplierIds).size !== supplierIds.length) {
      throw new BadRequestException('Supplier IDs must be unique');
    }
  }

  private async assertCodeAvailable(
    repository: Repository<Material>,
    code: string,
    currentId?: string,
  ): Promise<void> {
    const query = repository
      .createQueryBuilder('material')
      .where('LOWER(material.code) = LOWER(:code)', { code });
    if (currentId) {
      query.andWhere('material.id <> :currentId', { currentId });
    }
    if (await query.getOne()) {
      throw new ConflictException('Material code already exists');
    }
  }

  private async validateReferences(
    references: {
      unitId: string;
      deliveryTypeId: string | null;
      modelId: string | null;
      loadingPointId: string | null;
      supplierIds?: string[];
    },
    repositories: {
      unitRepository: Repository<Unit>;
      supplierRepository: Repository<Supplier>;
      modelRepository: Repository<MaterialModel>;
      deliveryTypeRepository: Repository<DeliveryType>;
      loadingPointRepository: Repository<LoadingPoint>;
    },
  ): Promise<void> {
    await this.assertActiveReference(
      repositories.unitRepository,
      references.unitId,
      'Unit',
    );
    if (references.deliveryTypeId) {
      await this.assertActiveReference(
        repositories.deliveryTypeRepository,
        references.deliveryTypeId,
        'Delivery type',
      );
    }
    if (references.modelId) {
      await this.assertActiveReference(
        repositories.modelRepository,
        references.modelId,
        'Material model',
      );
    }
    if (references.loadingPointId) {
      await this.assertActiveReference(
        repositories.loadingPointRepository,
        references.loadingPointId,
        'Loading point',
      );
    }
    if (references.supplierIds !== undefined) {
      await this.assertActiveSuppliers(
        repositories.supplierRepository,
        references.supplierIds,
      );
    }
  }

  private async assertActiveReference<
    T extends { id: string; isActive: boolean },
  >(repository: Repository<T>, id: string, label: string): Promise<void> {
    const reference = await repository.findOne({
      where: { id } as never,
      lock: { mode: 'pessimistic_read' },
    });
    if (!reference) {
      throw new NotFoundException(`${label} not found`);
    }
    if (!reference.isActive) {
      throw new BadRequestException(`${label} is inactive`);
    }
  }

  private async assertActiveSuppliers(
    repository: Repository<Supplier>,
    supplierIds: string[],
  ): Promise<void> {
    if (supplierIds.length === 0) return;
    const orderedIds = [...supplierIds].sort((first, second) => {
      const firstId = BigInt(first);
      const secondId = BigInt(second);
      return firstId < secondId ? -1 : firstId > secondId ? 1 : 0;
    });
    const found = await repository
      .createQueryBuilder('supplier')
      .where('supplier.id IN (:...supplierIds)', { supplierIds: orderedIds })
      .orderBy('supplier.id', 'ASC')
      .setLock('pessimistic_read')
      .getMany();
    const foundById = new Map(found.map((supplier) => [supplier.id, supplier]));
    const missingId = supplierIds.find((id) => !foundById.has(id));
    if (missingId) {
      throw new NotFoundException(`Supplier ${missingId} not found`);
    }
    const inactiveId = supplierIds.find((id) => !foundById.get(id)?.isActive);
    if (inactiveId) {
      throw new BadRequestException(`Supplier ${inactiveId} is inactive`);
    }
  }

  private applyUpdate(
    material: Material,
    dto: UpdateMaterialDto,
    normalizedCode: string,
    userId: string,
  ): void {
    if (dto.code !== undefined) material.code = normalizedCode;
    for (const field of [
      'name',
      'unitId',
      'deliveryTypeId',
      'modelId',
      'loadingPointId',
      'processLineName',
      'scale',
      'imagePath',
      'specification',
      'description',
      'isActive',
    ] as const) {
      if (dto[field] !== undefined) {
        (material[field] as (typeof dto)[typeof field]) = dto[field];
      }
    }
    material.updatedBy = userId;
  }

  private async synchronizeSuppliers(
    repository: Repository<SupplierMaterial>,
    materialId: string,
    supplierIds: string[],
    userId: string,
  ): Promise<void> {
    const existing = await repository.find({ where: { materialId } });
    const requested = new Set(supplierIds);
    const existingBySupplier = new Map(
      existing.map((mapping) => [mapping.supplierId, mapping]),
    );
    const changed: SupplierMaterial[] = [];

    for (const mapping of existing) {
      const shouldBeActive = requested.has(mapping.supplierId);
      if (mapping.isActive !== shouldBeActive) {
        mapping.isActive = shouldBeActive;
        mapping.updatedBy = userId;
        changed.push(mapping);
      }
    }
    for (const supplierId of supplierIds) {
      if (!existingBySupplier.has(supplierId)) {
        changed.push(
          repository.create({
            materialId,
            supplierId,
            isActive: true,
            createdBy: userId,
            updatedBy: userId,
          }),
        );
      }
    }
    if (changed.length > 0) {
      await this.saveSupplierMaterials(repository, changed);
    }
  }

  private async saveSupplierMaterials(
    repository: Repository<SupplierMaterial>,
    mappings: SupplierMaterial[],
  ): Promise<SupplierMaterial[]> {
    try {
      return await repository.save(mappings);
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException('Material supplier mapping already exists');
      }
      throw error;
    }
  }

  private isUniqueViolation(error: unknown): boolean {
    const databaseError = error as {
      code?: string;
      driverError?: { code?: string };
    };
    return (
      databaseError.code === '23505' ||
      databaseError.driverError?.code === '23505'
    );
  }

  private async saveMaterial(
    repository: Repository<Material>,
    material: Material,
  ): Promise<Material> {
    try {
      return await repository.save(material);
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException('Material code already exists');
      }
      throw error;
    }
  }

  private async setActive(
    id: string,
    isActive: boolean,
    userId: string,
  ): Promise<MaterialWithSuppliers> {
    return this.getDataSource().transaction(async (manager) => {
      const repository = manager.getRepository(Material);
      const material = await repository.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!material) {
        throw new NotFoundException('Material not found');
      }
      material.isActive = isActive;
      material.updatedBy = userId;
      await repository.save(material);
      return this.findOneUsing(repository, material.id);
    });
  }
}
