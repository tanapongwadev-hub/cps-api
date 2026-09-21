import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, SelectQueryBuilder } from 'typeorm';
import { ProductType } from '../../entities/master/product-type.entity';
import { CreateProductTypeDto } from './dto/create-product-type.dto';
import {
  ListProductTypesQueryDto,
  ProductTypeSortBy,
} from './dto/list-product-types-query.dto';
import { UpdateProductTypeDto } from './dto/update-product-type.dto';

const PRODUCT_TYPE_SORT_COLUMNS: Record<ProductTypeSortBy, string> = {
  code: 'productType.code',
  nameTh: 'productType.name_th',
  sortOrder: 'productType.sort_order',
  isActive: 'productType.is_active',
  createdAt: 'productType.created_at',
  updatedAt: 'productType.updated_at',
};

export type ProductTypeResponse = {
  id: string;
  code: string;
  nameTh: string;
  nameEn: string | null;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class ProductTypesService {
  constructor(
    @InjectRepository(ProductType)
    private readonly productTypeRepository: Repository<ProductType>,
    private readonly dataSource: DataSource,
  ) {}

  async create(
    dto: CreateProductTypeDto,
    userId: string,
  ): Promise<ProductTypeResponse> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(ProductType);
      const normalizedCode = this.normalizeCode(dto.code);
      await this.assertCodeAvailable(repository, normalizedCode);

      const productType = repository.create({
        code: normalizedCode,
        nameTh: dto.nameTh.trim(),
        nameEn: this.toNullable(dto.nameEn),
        description: this.toNullable(dto.description),
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
        createdBy: userId,
        updatedBy: userId,
      });
      const saved = await repository.save(productType);
      return this.toResponse(saved);
    });
  }

  async update(
    id: string,
    dto: UpdateProductTypeDto,
    userId: string,
  ): Promise<ProductTypeResponse> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(ProductType);
      const productType = await repository.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!productType) {
        throw new NotFoundException('Product type not found');
      }
      if (
        new Date(dto.updatedAt).getTime() !==
        new Date(productType.updatedAt).getTime()
      ) {
        throw new ConflictException('Product type has been updated');
      }

      const normalizedCode = dto.code
        ? this.normalizeCode(dto.code)
        : productType.code;
      if (dto.code) {
        await this.assertCodeAvailable(
          repository,
          normalizedCode,
          productType.id,
        );
      }

      if (dto.code !== undefined) productType.code = normalizedCode;
      if (dto.nameTh !== undefined) productType.nameTh = dto.nameTh.trim();
      if (dto.nameEn !== undefined) {
        productType.nameEn = this.toNullable(dto.nameEn);
      }
      if (dto.description !== undefined) {
        productType.description = this.toNullable(dto.description);
      }
      if (dto.sortOrder !== undefined) productType.sortOrder = dto.sortOrder;
      if (dto.isActive !== undefined) productType.isActive = dto.isActive;
      productType.updatedBy = userId;

      const saved = await repository.save(productType);
      return this.toResponse(saved);
    });
  }

  async deactivate(id: string, userId: string): Promise<ProductTypeResponse> {
    return this.setActive(id, false, userId);
  }

  async restore(id: string, userId: string): Promise<ProductTypeResponse> {
    return this.setActive(id, true, userId);
  }

  async findAll(query: ListProductTypesQueryDto): Promise<{
    items: ProductTypeResponse[];
    meta: {
      page: number;
      limit: number;
      totalItems: number;
      totalPages: number;
    };
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const queryBuilder: SelectQueryBuilder<ProductType> =
      this.productTypeRepository.createQueryBuilder('productType');

    if (query.search) {
      queryBuilder.andWhere(
        '(productType.code ILIKE :search OR productType.name_th ILIKE :search OR productType.name_en ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }
    if (query.isActive !== undefined) {
      queryBuilder.andWhere('productType.is_active = :isActive', {
        isActive: query.isActive,
      });
    }

    const sortColumn =
      PRODUCT_TYPE_SORT_COLUMNS[query.sortBy] ??
      PRODUCT_TYPE_SORT_COLUMNS.sortOrder;
    const sortOrder = query.sortOrder === 'desc' ? 'DESC' : 'ASC';
    const [rows, totalItems] = await queryBuilder
      .orderBy(sortColumn, sortOrder)
      .addOrderBy('productType.id', 'ASC')
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

  async findOne(id: string): Promise<ProductTypeResponse> {
    const productType = await this.productTypeRepository.findOne({
      where: { id },
    });
    if (!productType) {
      throw new NotFoundException('Product type not found');
    }
    return this.toResponse(productType);
  }

  private async setActive(
    id: string,
    isActive: boolean,
    userId: string,
  ): Promise<ProductTypeResponse> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(ProductType);
      const productType = await repository.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!productType) {
        throw new NotFoundException('Product type not found');
      }
      productType.isActive = isActive;
      productType.updatedBy = userId;
      const saved = await repository.save(productType);
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
    repository: Repository<ProductType>,
    code: string,
    currentId?: string,
  ): Promise<void> {
    const query = repository
      .createQueryBuilder('productType')
      .where('LOWER(productType.code) = LOWER(:code)', { code });
    if (currentId) {
      query.andWhere('productType.id <> :currentId', { currentId });
    }
    if (await query.getOne()) {
      throw new ConflictException('Product type code already exists');
    }
  }

  private toResponse(productType: ProductType): ProductTypeResponse {
    return {
      id: productType.id,
      code: productType.code,
      nameTh: productType.nameTh,
      nameEn: productType.nameEn,
      description: productType.description,
      sortOrder: productType.sortOrder,
      isActive: productType.isActive,
      createdBy: productType.createdBy,
      updatedBy: productType.updatedBy,
      createdAt: productType.createdAt,
      updatedAt: productType.updatedAt,
    };
  }
}
