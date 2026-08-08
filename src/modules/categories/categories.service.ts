import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, SelectQueryBuilder } from 'typeorm';
import { Category } from '../../entities/master/category.entity';
import { CreateCategoryDto } from './dto/create-category.dto';
import {
  CategorySortBy,
  ListCategoriesQueryDto,
} from './dto/list-categories-query.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

const CATEGORY_SORT_COLUMNS: Record<CategorySortBy, string> = {
  code: 'category.code',
  nameTh: 'category.name_th',
  sortOrder: 'category.sort_order',
  isActive: 'category.is_active',
  createdAt: 'category.created_at',
  updatedAt: 'category.updated_at',
};

export type CategoryResponse = {
  id: string;
  code: string;
  nameTh: string;
  nameEn: string | null;
  parentId: string | null;
  sortOrder: number;
  iconColor: string | null;
  description: string | null;
  isActive: boolean;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
    private readonly dataSource: DataSource,
  ) {}

  async create(
    dto: CreateCategoryDto,
    userId: string,
  ): Promise<CategoryResponse> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(Category);
      const normalizedCode = this.normalizeCode(dto.code);
      await this.assertCodeAvailable(repository, normalizedCode);
      if (dto.parentId) {
        await this.assertActiveReference(
          repository,
          dto.parentId,
          'Parent category',
        );
      }
      const cat = repository.create({
        code: normalizedCode,
        nameTh: dto.nameTh.trim(),
        nameEn: this.toNullable(dto.nameEn),
        parentId: this.toNullable(dto.parentId),
        sortOrder: dto.sortOrder ?? 0,
        iconColor: this.toNullable(dto.iconColor),
        description: this.toNullable(dto.description),
        isActive: dto.isActive ?? true,
        createdBy: userId,
        updatedBy: userId,
      });
      const saved = await repository.save(cat);
      return this.toResponse(saved);
    });
  }

  async update(
    id: string,
    dto: UpdateCategoryDto,
    userId: string,
  ): Promise<CategoryResponse> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(Category);
      const cat = await repository.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!cat) throw new NotFoundException('Category not found');
      if (
        new Date(dto.updatedAt).getTime() !== new Date(cat.updatedAt).getTime()
      ) {
        throw new ConflictException('Category has been updated');
      }
      const normalizedCode = dto.code ? this.normalizeCode(dto.code) : cat.code;
      if (dto.code) {
        await this.assertCodeAvailable(repository, normalizedCode, cat.id);
      }
      if (dto.parentId !== undefined) {
        if (dto.parentId && dto.parentId === id) {
          throw new ConflictException('Category cannot be its own parent');
        }
        if (dto.parentId) {
          await this.assertActiveReference(
            repository,
            dto.parentId,
            'Parent category',
          );
        }
      }
      if (dto.code !== undefined) cat.code = normalizedCode;
      if (dto.nameTh !== undefined) cat.nameTh = dto.nameTh.trim();
      if (dto.nameEn !== undefined) cat.nameEn = this.toNullable(dto.nameEn);
      if (dto.parentId !== undefined)
        cat.parentId = this.toNullable(dto.parentId);
      if (dto.sortOrder !== undefined) cat.sortOrder = dto.sortOrder;
      if (dto.iconColor !== undefined)
        cat.iconColor = this.toNullable(dto.iconColor);
      if (dto.description !== undefined)
        cat.description = this.toNullable(dto.description);
      if (dto.isActive !== undefined) cat.isActive = dto.isActive;
      cat.updatedBy = userId;
      const saved = await repository.save(cat);
      return this.toResponse(saved);
    });
  }

  async deactivate(id: string, userId: string) {
    return this.setActive(id, false, userId);
  }
  async restore(id: string, userId: string) {
    return this.setActive(id, true, userId);
  }

  async findAll(query: ListCategoriesQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const qb: SelectQueryBuilder<Category> =
      this.categoryRepository.createQueryBuilder('category');
    if (query.search) {
      qb.andWhere(
        '(category.code ILIKE :s OR category.name_th ILIKE :s OR category.name_en ILIKE :s)',
        { s: `%${query.search}%` },
      );
    }
    if (query.isActive !== undefined)
      qb.andWhere('category.is_active = :a', { a: query.isActive });
    const sortColumn =
      CATEGORY_SORT_COLUMNS[query.sortBy] ?? CATEGORY_SORT_COLUMNS.sortOrder;
    const sortOrder = query.sortOrder === 'desc' ? 'DESC' : 'ASC';
    const [rows, total] = await qb
      .orderBy(sortColumn, sortOrder)
      .addOrderBy('category.id', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
    return {
      items: rows.map((r) => this.toResponse(r)),
      meta: {
        page,
        limit,
        totalItems: total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const cat = await this.categoryRepository.findOne({ where: { id } });
    if (!cat) throw new NotFoundException('Category not found');
    return this.toResponse(cat);
  }

  private async setActive(id: string, isActive: boolean, userId: string) {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(Category);
      const cat = await repository.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!cat) throw new NotFoundException('Category not found');
      cat.isActive = isActive;
      cat.updatedBy = userId;
      const saved = await repository.save(cat);
      return this.toResponse(saved);
    });
  }

  private normalizeCode(code: string): string {
    return code.trim().toUpperCase();
  }
  private toNullable(v: string | number | null | undefined): string | null {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number') return String(v);
    const t = v.trim();
    return t === '' ? null : t;
  }

  private async assertCodeAvailable(
    repo: Repository<Category>,
    code: string,
    currentId?: string,
  ) {
    const q = repo
      .createQueryBuilder('c')
      .where('LOWER(c.code) = LOWER(:code)', { code });
    if (currentId) q.andWhere('c.id <> :id', { id: currentId });
    if (await q.getOne())
      throw new ConflictException('Category code already exists');
  }
  private async assertActiveReference(
    repo: Repository<Category>,
    id: string,
    label: string,
  ) {
    const r = await repo.findOne({ where: { id, isActive: true } });
    if (!r) throw new NotFoundException(`${label} not found`);
  }
  private toResponse(c: Category): CategoryResponse {
    return {
      id: c.id,
      code: c.code,
      nameTh: c.nameTh,
      nameEn: c.nameEn,
      parentId: c.parentId,
      sortOrder: c.sortOrder,
      iconColor: c.iconColor,
      description: c.description,
      isActive: c.isActive,
      createdBy: c.createdBy,
      updatedBy: c.updatedBy,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    };
  }
}
