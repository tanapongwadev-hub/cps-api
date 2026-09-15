import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, SelectQueryBuilder } from 'typeorm';
import { MaterialTypeMaster } from '../../entities/master/material-type.entity';
import { CreateMaterialTypeDto } from './dto/create-material-type.dto';
import {
  ListMaterialTypesQueryDto,
  MaterialTypeSortBy,
} from './dto/list-material-types-query.dto';
import { UpdateMaterialTypeDto } from './dto/update-material-type.dto';

const MATERIAL_TYPE_SORT_COLUMNS: Record<MaterialTypeSortBy, string> = {
  code: 'materialType.code',
  nameTh: 'materialType.name_th',
  isActive: 'materialType.is_active',
  createdAt: 'materialType.created_at',
  updatedAt: 'materialType.updated_at',
};

export type MaterialTypeResponse = {
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

@Injectable()
export class MaterialTypesService {
  constructor(
    @InjectRepository(MaterialTypeMaster)
    private readonly materialTypeRepository: Repository<MaterialTypeMaster>,
    private readonly dataSource: DataSource,
  ) {}

  async create(
    dto: CreateMaterialTypeDto,
    userId: string,
  ): Promise<MaterialTypeResponse> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(MaterialTypeMaster);
      const normalizedCode = this.normalizeCode(dto.code);
      await this.assertCodeAvailable(repository, normalizedCode);

      const materialType = repository.create({
        code: normalizedCode,
        nameTh: dto.nameTh.trim(),
        nameEn: this.toNullable(dto.nameEn),
        description: this.toNullable(dto.description),
        isActive: dto.isActive ?? true,
        createdBy: userId,
        updatedBy: userId,
      });
      const saved = await repository.save(materialType);
      return this.toResponse(saved);
    });
  }

  async update(
    id: string,
    dto: UpdateMaterialTypeDto,
    userId: string,
  ): Promise<MaterialTypeResponse> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(MaterialTypeMaster);
      const materialType = await repository.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!materialType) {
        throw new NotFoundException('Material type not found');
      }
      if (
        new Date(dto.updatedAt).getTime() !==
        new Date(materialType.updatedAt).getTime()
      ) {
        throw new ConflictException('Material type has been updated');
      }

      const normalizedCode = dto.code
        ? this.normalizeCode(dto.code)
        : materialType.code;
      if (dto.code) {
        await this.assertCodeAvailable(
          repository,
          normalizedCode,
          materialType.id,
        );
      }

      if (dto.code !== undefined) materialType.code = normalizedCode;
      if (dto.nameTh !== undefined) materialType.nameTh = dto.nameTh.trim();
      if (dto.nameEn !== undefined) {
        materialType.nameEn = this.toNullable(dto.nameEn);
      }
      if (dto.description !== undefined) {
        materialType.description = this.toNullable(dto.description);
      }
      if (dto.isActive !== undefined) materialType.isActive = dto.isActive;
      materialType.updatedBy = userId;

      const saved = await repository.save(materialType);
      return this.toResponse(saved);
    });
  }

  async deactivate(id: string, userId: string): Promise<MaterialTypeResponse> {
    return this.setActive(id, false, userId);
  }

  async restore(id: string, userId: string): Promise<MaterialTypeResponse> {
    return this.setActive(id, true, userId);
  }

  async findAll(query: ListMaterialTypesQueryDto): Promise<{
    items: MaterialTypeResponse[];
    meta: {
      page: number;
      limit: number;
      totalItems: number;
      totalPages: number;
    };
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const queryBuilder: SelectQueryBuilder<MaterialTypeMaster> =
      this.materialTypeRepository.createQueryBuilder('materialType');

    if (query.search) {
      queryBuilder.andWhere(
        '(materialType.code ILIKE :search OR materialType.name_th ILIKE :search OR materialType.name_en ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }
    if (query.isActive !== undefined) {
      queryBuilder.andWhere('materialType.is_active = :isActive', {
        isActive: query.isActive,
      });
    }

    const sortColumn =
      MATERIAL_TYPE_SORT_COLUMNS[query.sortBy] ??
      MATERIAL_TYPE_SORT_COLUMNS.code;
    const sortOrder = query.sortOrder === 'desc' ? 'DESC' : 'ASC';
    const [rows, totalItems] = await queryBuilder
      .orderBy(sortColumn, sortOrder)
      .addOrderBy('materialType.id', 'ASC')
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

  async findOne(id: string): Promise<MaterialTypeResponse> {
    const materialType = await this.materialTypeRepository.findOne({
      where: { id },
    });
    if (!materialType) {
      throw new NotFoundException('Material type not found');
    }
    return this.toResponse(materialType);
  }

  private async setActive(
    id: string,
    isActive: boolean,
    userId: string,
  ): Promise<MaterialTypeResponse> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(MaterialTypeMaster);
      const materialType = await repository.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!materialType) {
        throw new NotFoundException('Material type not found');
      }
      materialType.isActive = isActive;
      materialType.updatedBy = userId;
      const saved = await repository.save(materialType);
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
    repository: Repository<MaterialTypeMaster>,
    code: string,
    currentId?: string,
  ): Promise<void> {
    const query = repository
      .createQueryBuilder('materialType')
      .where('LOWER(materialType.code) = LOWER(:code)', { code });
    if (currentId) {
      query.andWhere('materialType.id <> :currentId', { currentId });
    }
    if (await query.getOne()) {
      throw new ConflictException('Material type code already exists');
    }
  }

  private toResponse(materialType: MaterialTypeMaster): MaterialTypeResponse {
    return {
      id: materialType.id,
      code: materialType.code,
      nameTh: materialType.nameTh,
      nameEn: materialType.nameEn,
      description: materialType.description,
      isActive: materialType.isActive,
      createdBy: materialType.createdBy,
      updatedBy: materialType.updatedBy,
      createdAt: materialType.createdAt,
      updatedAt: materialType.updatedAt,
    };
  }
}
