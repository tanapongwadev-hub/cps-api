import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Product } from '../../entities/master/product.entity';
import { ProductModel } from '../../entities/master/product-model.entity';
import { Customer } from '../../entities/master/customer.entity';
import { Location } from '../../entities/master/location.entity';
import { ProductType } from '../../entities/master/product-type.entity';
import { DeliveryType } from '../../entities/master/delivery-type.entity';
import { LoadingPoint } from '../../entities/master/loading-point.entity';
import { ProcessLine } from '../../entities/master/process-line.entity';
import { Unit } from '../../entities/master/unit.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { ListProductsQueryDto } from './dto/list-products-query.dto';
import { ProductImageStorageService } from './product-image-storage.service';
import { UpdateProductDto } from './dto/update-product.dto';

const PRODUCT_SORT_DB_COLUMNS: Record<string, string> = {
  code: 'product.code',
  name: 'product.name',
  isActive: 'product.isActive',
  createdAt: 'product.createdAt',
  updatedAt: 'product.updatedAt',
};

export type ProductLookup = {
  id: string;
  code: string;
  nameTh: string;
  nameEn?: string | null;
};

export type ProductLookupsResponse = {
  units: ProductLookup[];
  productModels: ProductLookup[];
  customers: ProductLookup[];
  locations: ProductLookup[];
  productTypes: ProductLookup[];
  deliveryTypes: ProductLookup[];
  loadingPoints: ProductLookup[];
  processLines: ProductLookup[];
};

export type ProductWithRelations = Product;

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    @InjectRepository(Product)
    private productRepository: Repository<Product>,
    @InjectRepository(ProductModel)
    private productModelRepository: Repository<ProductModel>,
    @InjectRepository(Customer)
    private customerRepository: Repository<Customer>,
    @InjectRepository(Location)
    private locationRepository: Repository<Location>,
    @InjectRepository(ProductType)
    private productTypeRepository: Repository<ProductType>,
    @InjectRepository(DeliveryType)
    private deliveryTypeRepository: Repository<DeliveryType>,
    @InjectRepository(LoadingPoint)
    private loadingPointRepository: Repository<LoadingPoint>,
    @InjectRepository(ProcessLine)
    private processLineRepository: Repository<ProcessLine>,
    @InjectRepository(Unit)
    private unitRepository: Repository<Unit>,
    private dataSource?: DataSource,
    @Optional()
    private imageStorage?: ProductImageStorageService,
  ) {}

  private getDataSource(): DataSource {
    return this.dataSource!;
  }

  /**
   * Resolve safetyStock and minStock from user input + production params.
   *
   *   safety_stock = safetyStock ?? lotSize           (one lot as safety buffer)
   *   min_stock     = minStock ?? packing            (one pack as reorder trigger)
   *
   * These formulas run on every create/update so the columns always reflect
   * the current production parameters unless the caller explicitly overrides
   * them via safetyStock / minStock fields.
   */
  private computeStockLevels(
    packing: number,
    lotSize: number,
    safetyStockOverride?: number | null,
    minStockOverride?: number | null,
  ): { safetyStock: number; minStock: number } {
    const safeLot = lotSize > 0 ? lotSize : 1;
    const safePack = packing > 0 ? packing : 1;
    return {
      safetyStock: safetyStockOverride ?? safeLot,
      minStock: minStockOverride ?? safePack,
    };
  }

  async findAll(
    query: ListProductsQueryDto,
  ): Promise<{ items: ProductWithRelations[]; meta: { totalItems: number } }> {
    const {
      search,
      isActive,
      modelId,
      customerId,
      productTypeId,
      locationId,
      processLineId,
      sortBy = 'code',
      sortOrder = 'asc',
    } = query;

    const qb = this.productRepository
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.unit', 'unit')
      .leftJoinAndSelect('product.model', 'model')
      .leftJoinAndSelect('product.customer', 'customer')
      .leftJoinAndSelect('product.location', 'location')
      .leftJoinAndSelect('product.productType', 'productType')
      .leftJoinAndSelect('product.deliveryType', 'deliveryType')
      .leftJoinAndSelect('product.loadingPoint', 'loadingPoint')
      .leftJoinAndSelect('product.processLine', 'processLine')
      .select([
        'product.id',
        'product.code',
        'product.name',
        'product.unitId',
        'product.modelId',
        'product.customerId',
        'product.packing',
        'product.locationId',
        'product.safetyStock',
        'product.productTypeId',
        'product.lotSize',
        'product.minStock',
        'product.deliveryTypeId',
        'product.scale',
        'product.loadingPointId',
        'product.processLineId',
        'product.productImagePath',
        'product.isActive',
        'product.createdAt',
        'product.updatedAt',
        'unit.id',
        'unit.code',
        'unit.nameTh',
        'model.id',
        'model.code',
        'model.nameTh',
        'model.brand',
        'customer.id',
        'customer.code',
        'customer.nameTh',
        'location.id',
        'location.code',
        'location.nameTh',
        'productType.id',
        'productType.code',
        'productType.nameTh',
        'deliveryType.id',
        'deliveryType.code',
        'deliveryType.nameTh',
        'loadingPoint.id',
        'loadingPoint.code',
        'loadingPoint.nameTh',
        'processLine.id',
        'processLine.code',
        'processLine.nameTh',
      ]);

    if (search) {
      qb.andWhere(
        `(product.code ILIKE :search OR product.name ILIKE :search OR model.name_th ILIKE :search OR customer.name_th ILIKE :search)`,
        { search: `%${search}%` },
      );
    }
    if (isActive !== undefined) {
      qb.andWhere('product.isActive = :isActive', { isActive });
    }
    if (modelId) qb.andWhere('product.modelId = :modelId', { modelId });
    if (customerId)
      qb.andWhere('product.customerId = :customerId', { customerId });
    if (productTypeId)
      qb.andWhere('product.productTypeId = :productTypeId', { productTypeId });
    if (locationId)
      qb.andWhere('product.locationId = :locationId', { locationId });
    if (processLineId)
      qb.andWhere('product.processLineId = :processLineId', { processLineId });

    const sortCol = PRODUCT_SORT_DB_COLUMNS[sortBy] ?? 'product.code';
    qb.orderBy(sortCol, sortOrder === 'desc' ? 'DESC' : 'ASC');

    const [items, totalItems] = await qb.getManyAndCount();
    return { items, meta: { totalItems } };
  }

  async getLookups(): Promise<ProductLookupsResponse> {
    const isActiveFilter = { where: { isActive: true } } as const;
    const baseSelect = ['id', 'code', 'nameTh', 'nameEn'] as const;

    const [
      units,
      productModels,
      customers,
      locations,
      productTypes,
      deliveryTypes,
      loadingPoints,
      processLines,
    ] = await Promise.all([
      this.unitRepository.find({
        ...isActiveFilter,
        select: ['id', 'code', 'nameTh'],
        order: { code: 'ASC' },
      }),
      this.productModelRepository.find({
        ...isActiveFilter,
        select: baseSelect as never,
        order: { nameTh: 'ASC' },
      }),
      this.customerRepository.find({
        ...isActiveFilter,
        select: baseSelect as never,
        order: { nameTh: 'ASC' },
      }),
      this.locationRepository.find({
        ...isActiveFilter,
        select: baseSelect as never,
        order: { nameTh: 'ASC' },
      }),
      this.productTypeRepository.find({
        ...isActiveFilter,
        select: baseSelect as never,
        order: { sortOrder: 'ASC' },
      }),
      this.deliveryTypeRepository.find({
        ...isActiveFilter,
        select: baseSelect as never,
        order: { nameTh: 'ASC' },
      }),
      this.loadingPointRepository.find({
        ...isActiveFilter,
        select: baseSelect as never,
        order: { nameTh: 'ASC' },
      }),
      this.processLineRepository.find({
        ...isActiveFilter,
        select: baseSelect as never,
        order: { nameTh: 'ASC' },
      }),
    ]);

    return {
      units,
      productModels,
      customers,
      locations,
      productTypes,
      deliveryTypes,
      loadingPoints,
      processLines,
    };
  }

  async findOne(id: string): Promise<ProductWithRelations> {
    const product = await this.productRepository.findOne({
      where: { id },
      relations: [
        'unit',
        'model',
        'customer',
        'location',
        'productType',
        'deliveryType',
        'loadingPoint',
        'processLine',
      ],
    });
    if (!product) {
      throw new NotFoundException(`Product with id ${id} not found`);
    }
    return product;
  }

  async create(
    dto: CreateProductDto,
    userId: string,
  ): Promise<ProductWithRelations> {
    let promotedImagePath: string | undefined;
    try {
      if (dto.productImagePath) {
        promotedImagePath = await this.getImageStorage().promote(
          dto.productImagePath,
        );
      }

      return await this.getDataSource().transaction(async (manager) => {
        const repo = manager.getRepository(Product);
        const packing = dto.packing ?? 1;
        const lotSize = dto.lotSize ?? 1;
        const { safetyStock, minStock } = this.computeStockLevels(
          packing,
          lotSize,
          dto.safetyStock ?? null,
          dto.minStock ?? null,
        );

        const refs = await this.validateForeignKeys(manager, {
          unitId: dto.unitId,
          modelId: dto.modelId,
          customerId: dto.customerId,
          locationId: dto.locationId,
          productTypeId: dto.productTypeId,
          deliveryTypeId: dto.deliveryTypeId,
          loadingPointId: dto.loadingPointId,
          processLineId: dto.processLineId,
        });

        const existing = await repo.findOne({ where: { code: dto.code } });
        if (existing) {
          throw new ConflictException(
            `Product code "${dto.code}" already exists`,
          );
        }

        const product = repo.create({
          code: dto.code,
          name: dto.name,
          unitId: dto.unitId,
          modelId: dto.modelId,
          customerId: dto.customerId,
          packing,
          locationId: dto.locationId,
          safetyStock,
          productTypeId: dto.productTypeId,
          lotSize,
          minStock,
          deliveryTypeId: dto.deliveryTypeId,
          scale: dto.scale ?? null,
          loadingPointId: dto.loadingPointId,
          processLineId: dto.processLineId,
          productImagePath: promotedImagePath ?? null,
          isActive: dto.isActive ?? true,
          createdBy: userId,
        });

        const saved = await repo.save(product);
        const reloaded = await repo.findOne({
          where: { id: saved.id },
          relations: [
            'unit',
            'model',
            'customer',
            'location',
            'productType',
            'deliveryType',
            'loadingPoint',
            'processLine',
          ],
        });
        if (!reloaded) {
          throw new NotFoundException(
            `Product with id ${saved.id} not found after save`,
          );
        }
        if (Object.keys(refs).length === 0) {
          this.logger.warn(
            'Product FK validation returned an empty map (unexpected)',
          );
        }
        return reloaded;
      });
    } catch (error) {
      await this.compensatePromotedImage(promotedImagePath);
      throw error;
    }
  }

  async update(
    id: string,
    dto: UpdateProductDto,
    userId: string,
  ): Promise<ProductWithRelations> {
    let promotedImagePath: string | undefined;
    let previousImagePath: string | null | undefined;
    let imageChanged = false;
    let result: ProductWithRelations;
    try {
      result = await this.getDataSource().transaction(async (manager) => {
        const repo = manager.getRepository(Product);
        const product = await repo.findOne({ where: { id } });
        if (!product) {
          throw new NotFoundException(`Product with id ${id} not found`);
        }

        previousImagePath = product.productImagePath;
        let nextImagePath = product.productImagePath;
        if (dto.productImagePath !== undefined) {
          imageChanged = dto.productImagePath !== product.productImagePath;
          if (imageChanged && dto.productImagePath !== null) {
            promotedImagePath = await this.getImageStorage().promote(
              dto.productImagePath,
            );
            nextImagePath = promotedImagePath;
          } else {
            nextImagePath = dto.productImagePath;
          }
        }

        // Build the "would-be" final values so we can recompute stock correctly
        // (use new value if provided, else keep current).
        const nextPacking = dto.packing ?? product.packing;
        const nextLotSize = dto.lotSize ?? product.lotSize;

        // Only recompute when caller didn't explicitly override.
        let nextSafety = dto.safetyStock ?? product.safetyStock;
        let nextMin = dto.minStock ?? product.minStock;
        // If packing/lotSize changed AND the current safety/min match the old
        // auto-formula result, recompute; otherwise respect the user override.
        const autoSafetyFromOldLot = product.lotSize;
        const autoMinFromOldPack = product.packing;
        const safetyWasAuto = product.safetyStock === autoSafetyFromOldLot;
        const minWasAuto = product.minStock === autoMinFromOldPack;
        if (
          dto.lotSize !== undefined &&
          safetyWasAuto &&
          dto.safetyStock === undefined
        ) {
          nextSafety = nextLotSize;
        }
        if (
          dto.packing !== undefined &&
          minWasAuto &&
          dto.minStock === undefined
        ) {
          nextMin = nextPacking;
        }
        // Recompute from scratch if any input changed and no override was given
        if (
          dto.safetyStock === undefined &&
          (dto.lotSize !== undefined || dto.packing !== undefined)
        ) {
          nextSafety = nextLotSize;
        }
        if (
          dto.minStock === undefined &&
          (dto.packing !== undefined || dto.lotSize !== undefined)
        ) {
          nextMin = nextPacking;
        }
        // Final guard
        if (nextSafety < 0) nextSafety = 0;
        if (nextMin < 0) nextMin = 0;

        // Validate any FK that was provided
        await this.validateForeignKeys(
          manager,
          {
            unitId: dto.unitId,
            modelId: dto.modelId,
            customerId: dto.customerId,
            locationId: dto.locationId,
            productTypeId: dto.productTypeId,
            deliveryTypeId: dto.deliveryTypeId,
            loadingPointId: dto.loadingPointId,
            processLineId: dto.processLineId,
          },
          /*partial*/ true,
        );

        // Code uniqueness
        if (dto.code && dto.code !== product.code) {
          const existing = await repo.findOne({ where: { code: dto.code } });
          if (existing) {
            throw new ConflictException(
              `Product code "${dto.code}" already exists`,
            );
          }
        }

        Object.assign(product, {
          code: dto.code ?? product.code,
          name: dto.name ?? product.name,
          unitId: dto.unitId ?? product.unitId,
          modelId: dto.modelId ?? product.modelId,
          customerId: dto.customerId ?? product.customerId,
          packing: nextPacking,
          locationId: dto.locationId ?? product.locationId,
          safetyStock: nextSafety,
          productTypeId: dto.productTypeId ?? product.productTypeId,
          lotSize: nextLotSize,
          minStock: nextMin,
          deliveryTypeId: dto.deliveryTypeId ?? product.deliveryTypeId,
          scale: dto.scale ?? product.scale,
          loadingPointId: dto.loadingPointId ?? product.loadingPointId,
          processLineId: dto.processLineId ?? product.processLineId,
          productImagePath: nextImagePath,
          isActive: dto.isActive ?? product.isActive,
          updatedBy: userId,
        });

        await repo.save(product);
        const reloaded = await repo.findOne({
          where: { id },
          relations: [
            'unit',
            'model',
            'customer',
            'location',
            'productType',
            'deliveryType',
            'loadingPoint',
            'processLine',
          ],
        });
        if (!reloaded) {
          throw new NotFoundException(
            `Product with id ${id} not found after update`,
          );
        }
        return reloaded;
      });
    } catch (error) {
      await this.compensatePromotedImage(promotedImagePath);
      throw error;
    }

    if (
      imageChanged &&
      previousImagePath &&
      previousImagePath !== result.productImagePath
    ) {
      await this.discardCommittedImage(previousImagePath);
    }
    return result;
  }

  private getImageStorage(): ProductImageStorageService {
    if (!this.imageStorage) {
      throw new Error('ProductsService image storage is not configured');
    }
    return this.imageStorage;
  }

  private async compensatePromotedImage(imagePath?: string): Promise<void> {
    if (!imagePath) return;
    try {
      await this.getImageStorage().discard(imagePath);
    } catch (error) {
      this.logger.warn(
        `Failed to compensate Product image ${imagePath}`,
        error,
      );
    }
  }

  private async discardCommittedImage(imagePath: string): Promise<void> {
    try {
      await this.getImageStorage().discard(imagePath);
    } catch (error) {
      this.logger.warn(`Failed to discard Product image ${imagePath}`, error);
    }
  }

  async deactivate(id: string, userId: string): Promise<ProductWithRelations> {
    return this.getDataSource().transaction(async (manager) => {
      const repo = manager.getRepository(Product);
      const product = await repo.findOne({ where: { id } });
      if (!product)
        throw new NotFoundException(`Product with id ${id} not found`);
      product.isActive = false;
      product.updatedBy = userId;
      await repo.save(product);
      const reloaded = await repo.findOne({
        where: { id },
        relations: [
          'unit',
          'model',
          'customer',
          'location',
          'productType',
          'deliveryType',
          'loadingPoint',
          'processLine',
        ],
      });
      if (!reloaded) {
        throw new NotFoundException(
          `Product with id ${id} not found after deactivate`,
        );
      }
      return reloaded;
    });
  }

  async restore(id: string, userId: string): Promise<ProductWithRelations> {
    return this.getDataSource().transaction(async (manager) => {
      const repo = manager.getRepository(Product);
      const product = await repo.findOne({ where: { id } });
      if (!product)
        throw new NotFoundException(`Product with id ${id} not found`);
      product.isActive = true;
      product.updatedBy = userId;
      await repo.save(product);
      const reloaded = await repo.findOne({
        where: { id },
        relations: [
          'unit',
          'model',
          'customer',
          'location',
          'productType',
          'deliveryType',
          'loadingPoint',
          'processLine',
        ],
      });
      if (!reloaded) {
        throw new NotFoundException(
          `Product with id ${id} not found after restore`,
        );
      }
      return reloaded;
    });
  }

  /**
   * Validate every provided FK by id. Throws ConflictException for any
   * missing reference. When `partial` is true, undefined IDs are skipped
   * (used by PATCH where the caller may update only a subset of FKs).
   */
  private async validateForeignKeys(
    manager: import('typeorm').EntityManager,
    refs: {
      unitId?: string;
      modelId?: string;
      customerId?: string;
      locationId?: string;
      productTypeId?: string;
      deliveryTypeId?: string;
      loadingPointId?: string;
      processLineId?: string;
    },
    partial = false,
  ): Promise<Record<string, unknown>> {
    const checks: Array<[string, () => Promise<unknown>]> = [
      [
        'unitId',
        () =>
          manager.getRepository(Unit).findOne({ where: { id: refs.unitId } }),
      ],
      [
        'modelId',
        () =>
          manager
            .getRepository(ProductModel)
            .findOne({ where: { id: refs.modelId } }),
      ],
      [
        'customerId',
        () =>
          manager
            .getRepository(Customer)
            .findOne({ where: { id: refs.customerId } }),
      ],
      [
        'locationId',
        () =>
          manager
            .getRepository(Location)
            .findOne({ where: { id: refs.locationId } }),
      ],
      [
        'productTypeId',
        () =>
          manager
            .getRepository(ProductType)
            .findOne({ where: { id: refs.productTypeId } }),
      ],
      [
        'deliveryTypeId',
        () =>
          manager
            .getRepository(DeliveryType)
            .findOne({ where: { id: refs.deliveryTypeId } }),
      ],
      [
        'loadingPointId',
        () =>
          manager
            .getRepository(LoadingPoint)
            .findOne({ where: { id: refs.loadingPointId } }),
      ],
      [
        'processLineId',
        () =>
          manager
            .getRepository(ProcessLine)
            .findOne({ where: { id: refs.processLineId } }),
      ],
    ];

    const found: Record<string, unknown> = {};
    for (const [key, query] of checks) {
      const value = (refs as Record<string, string | undefined>)[key];
      if (value === undefined) {
        if (!partial) {
          throw new ConflictException(`${key} is required`);
        }
        continue;
      }
      const row = await query();
      if (!row) {
        throw new ConflictException(`${key}="${value}" not found`);
      }
      found[key] = row;
    }
    return found;
  }
}
