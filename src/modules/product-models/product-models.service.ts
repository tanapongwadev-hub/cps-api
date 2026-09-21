import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, SelectQueryBuilder } from 'typeorm';
import { ProductModel } from '../../entities/master/product-model.entity';
import { CreateProductModelDto } from './dto/create-product-model.dto';
import {
  ListProductModelsQueryDto,
  ProductModelSortBy,
} from './dto/list-product-models-query.dto';
import { UpdateProductModelDto } from './dto/update-product-model.dto';

const PRODUCT_MODEL_SORT_COLUMNS: Record<ProductModelSortBy, string> = {
  code: 'productModel.code',
  nameTh: 'productModel.name_th',
  isActive: 'productModel.is_active',
  createdAt: 'productModel.created_at',
  updatedAt: 'productModel.updated_at',
};

export type ProductModelResponse = {
  id: string;
  code: string;
  nameTh: string;
  nameEn: string | null;
  brand: string | null;
  description: string | null;
  isActive: boolean;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class ProductModelsService {
  constructor(
    @InjectRepository(ProductModel)
    private readonly productModelRepository: Repository<ProductModel>,
    private readonly dataSource: DataSource,
  ) {}

  async create(
    dto: CreateProductModelDto,
    userId: string,
  ): Promise<ProductModelResponse> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(ProductModel);
      const normalizedCode = this.normalizeCode(dto.code);
      await this.assertCodeAvailable(repository, normalizedCode);

      const productModel = repository.create({
        code: normalizedCode,
        nameTh: dto.nameTh.trim(),
        nameEn: this.toNullable(dto.nameEn),
        brand: this.toNullable(dto.brand),
        description: this.toNullable(dto.description),
        isActive: dto.isActive ?? true,
        createdBy: userId,
        updatedBy: userId,
      });
      const saved = await repository.save(productModel);
      return this.toResponse(saved);
    });
  }

  async update(
    id: string,
    dto: UpdateProductModelDto,
    userId: string,
  ): Promise<ProductModelResponse> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(ProductModel);
      const productModel = await repository.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!productModel) {
        throw new NotFoundException('Product model not found');
      }
      if (
        new Date(dto.updatedAt).getTime() !==
        new Date(productModel.updatedAt).getTime()
      ) {
        throw new ConflictException('Product model has been updated');
      }

      const normalizedCode = dto.code
        ? this.normalizeCode(dto.code)
        : productModel.code;
      if (dto.code) {
        await this.assertCodeAvailable(
          repository,
          normalizedCode,
          productModel.id,
        );
      }

      if (dto.code !== undefined) productModel.code = normalizedCode;
      if (dto.nameTh !== undefined) productModel.nameTh = dto.nameTh.trim();
      if (dto.nameEn !== undefined) {
        productModel.nameEn = this.toNullable(dto.nameEn);
      }
      if (dto.brand !== undefined) {
        productModel.brand = this.toNullable(dto.brand);
      }
      if (dto.description !== undefined) {
        productModel.description = this.toNullable(dto.description);
      }
      if (dto.isActive !== undefined) productModel.isActive = dto.isActive;
      productModel.updatedBy = userId;

      const saved = await repository.save(productModel);
      return this.toResponse(saved);
    });
  }

  async deactivate(id: string, userId: string): Promise<ProductModelResponse> {
    return this.setActive(id, false, userId);
  }

  async restore(id: string, userId: string): Promise<ProductModelResponse> {
    return this.setActive(id, true, userId);
  }

  async findAll(query: ListProductModelsQueryDto): Promise<{
    items: ProductModelResponse[];
    meta: {
      page: number;
      limit: number;
      totalItems: number;
      totalPages: number;
    };
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const queryBuilder: SelectQueryBuilder<ProductModel> =
      this.productModelRepository.createQueryBuilder('productModel');

    if (query.search) {
      queryBuilder.andWhere(
        '(productModel.code ILIKE :search OR productModel.name_th ILIKE :search OR productModel.name_en ILIKE :search OR productModel.brand ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }
    if (query.isActive !== undefined) {
      queryBuilder.andWhere('productModel.is_active = :isActive', {
        isActive: query.isActive,
      });
    }

    const sortColumn =
      PRODUCT_MODEL_SORT_COLUMNS[query.sortBy] ??
      PRODUCT_MODEL_SORT_COLUMNS.code;
    const sortOrder = query.sortOrder === 'desc' ? 'DESC' : 'ASC';
    const [rows, totalItems] = await queryBuilder
      .orderBy(sortColumn, sortOrder)
      .addOrderBy('productModel.id', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      items: rows.map((row) => this.toResponse(row)),
      meta: {
        page,
        limit,
        totalItems,
        totalPages: Math.ceil(totalItems / limit),
      },
    };
  }

  async findOne(id: string): Promise<ProductModelResponse> {
    const productModel = await this.productModelRepository.findOne({
      where: { id },
    });
    if (!productModel) {
      throw new NotFoundException('Product model not found');
    }
    return this.toResponse(productModel);
  }

  private async setActive(
    id: string,
    isActive: boolean,
    userId: string,
  ): Promise<ProductModelResponse> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(ProductModel);
      const productModel = await repository.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!productModel) {
        throw new NotFoundException('Product model not found');
      }
      productModel.isActive = isActive;
      productModel.updatedBy = userId;
      const saved = await repository.save(productModel);
      return this.toResponse(saved);
    });
  }

  private normalizeCode(code: string): string {
    return code.trim().toUpperCase();
  }

  private toNullable(value: string | null | undefined): string | null {
    if (value === null || value === undefined) return null;
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  }

  private async assertCodeAvailable(
    repository: Repository<ProductModel>,
    code: string,
    currentId?: string,
  ): Promise<void> {
    const query = repository
      .createQueryBuilder('productModel')
      .where('LOWER(productModel.code) = LOWER(:code)', { code });
    if (currentId) {
      query.andWhere('productModel.id <> :currentId', { currentId });
    }
    if (await query.getOne()) {
      throw new ConflictException('Product model code already exists');
    }
  }

  private toResponse(productModel: ProductModel): ProductModelResponse {
    return {
      id: productModel.id,
      code: productModel.code,
      nameTh: productModel.nameTh,
      nameEn: productModel.nameEn,
      brand: productModel.brand,
      description: productModel.description,
      isActive: productModel.isActive,
      createdBy: productModel.createdBy,
      updatedBy: productModel.updatedBy,
      createdAt: productModel.createdAt,
      updatedAt: productModel.updatedAt,
    };
  }
}
