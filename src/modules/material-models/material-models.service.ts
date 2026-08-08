import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, SelectQueryBuilder } from 'typeorm';
import { MaterialModel } from '../../entities/master/material-model.entity';
import { CreateMaterialModelDto } from './dto/create-material-model.dto';
import {
  ListMaterialModelsQueryDto,
  MaterialModelSortBy,
} from './dto/list-material-models-query.dto';
import { UpdateMaterialModelDto } from './dto/update-material-model.dto';

const MATERIAL_MODEL_SORT_COLUMNS: Record<MaterialModelSortBy, string> = {
  code: 'model.code',
  nameTh: 'model.name_th',
  isActive: 'model.is_active',
  createdAt: 'model.created_at',
  updatedAt: 'model.updated_at',
};

export type MaterialModelResponse = {
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
export class MaterialModelsService {
  constructor(
    @InjectRepository(MaterialModel)
    private readonly modelRepository: Repository<MaterialModel>,
    private readonly dataSource: DataSource,
  ) {}

  async create(
    dto: CreateMaterialModelDto,
    userId: string,
  ): Promise<MaterialModelResponse> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(MaterialModel);
      const normalizedCode = this.normalizeCode(dto.code);
      await this.assertCodeAvailable(repository, normalizedCode);

      const model = repository.create({
        code: normalizedCode,
        nameTh: dto.nameTh.trim(),
        nameEn: this.toNullable(dto.nameEn),
        description: this.toNullable(dto.description),
        isActive: dto.isActive ?? true,
        createdBy: userId,
        updatedBy: userId,
      });
      const saved = await repository.save(model);
      return this.toResponse(saved);
    });
  }

  async update(
    id: string,
    dto: UpdateMaterialModelDto,
    userId: string,
  ): Promise<MaterialModelResponse> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(MaterialModel);
      const model = await repository.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!model) {
        throw new NotFoundException('Material model not found');
      }
      if (
        new Date(dto.updatedAt).getTime() !==
        new Date(model.updatedAt).getTime()
      ) {
        throw new ConflictException('Material model has been updated');
      }

      const normalizedCode = dto.code
        ? this.normalizeCode(dto.code)
        : model.code;
      if (dto.code) {
        await this.assertCodeAvailable(repository, normalizedCode, model.id);
      }

      if (dto.code !== undefined) model.code = normalizedCode;
      if (dto.nameTh !== undefined) model.nameTh = dto.nameTh.trim();
      if (dto.nameEn !== undefined) {
        model.nameEn = this.toNullable(dto.nameEn);
      }
      if (dto.description !== undefined) {
        model.description = this.toNullable(dto.description);
      }
      if (dto.isActive !== undefined) model.isActive = dto.isActive;
      model.updatedBy = userId;

      const saved = await repository.save(model);
      return this.toResponse(saved);
    });
  }

  async deactivate(id: string, userId: string): Promise<MaterialModelResponse> {
    return this.setActive(id, false, userId);
  }

  async restore(id: string, userId: string): Promise<MaterialModelResponse> {
    return this.setActive(id, true, userId);
  }

  async findAll(query: ListMaterialModelsQueryDto): Promise<{
    items: MaterialModelResponse[];
    meta: {
      page: number;
      limit: number;
      totalItems: number;
      totalPages: number;
    };
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const queryBuilder: SelectQueryBuilder<MaterialModel> =
      this.modelRepository.createQueryBuilder('model');

    if (query.search) {
      queryBuilder.andWhere(
        '(model.code ILIKE :search OR model.name_th ILIKE :search OR model.name_en ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }
    if (query.isActive !== undefined) {
      queryBuilder.andWhere('model.is_active = :isActive', {
        isActive: query.isActive,
      });
    }

    const sortColumn =
      MATERIAL_MODEL_SORT_COLUMNS[query.sortBy] ??
      MATERIAL_MODEL_SORT_COLUMNS.code;
    const sortOrder = query.sortOrder === 'desc' ? 'DESC' : 'ASC';
    const [rows, totalItems] = await queryBuilder
      .orderBy(sortColumn, sortOrder)
      .addOrderBy('model.id', 'ASC')
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

  async findOne(id: string): Promise<MaterialModelResponse> {
    const model = await this.modelRepository.findOne({ where: { id } });
    if (!model) {
      throw new NotFoundException('Material model not found');
    }
    return this.toResponse(model);
  }

  private async setActive(
    id: string,
    isActive: boolean,
    userId: string,
  ): Promise<MaterialModelResponse> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(MaterialModel);
      const model = await repository.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!model) {
        throw new NotFoundException('Material model not found');
      }
      model.isActive = isActive;
      model.updatedBy = userId;
      const saved = await repository.save(model);
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
    repository: Repository<MaterialModel>,
    code: string,
    currentId?: string,
  ): Promise<void> {
    const query = repository
      .createQueryBuilder('model')
      .where('LOWER(model.code) = LOWER(:code)', { code });
    if (currentId) {
      query.andWhere('model.id <> :currentId', { currentId });
    }
    if (await query.getOne()) {
      throw new ConflictException('Material model code already exists');
    }
  }

  private toResponse(model: MaterialModel): MaterialModelResponse {
    return {
      id: model.id,
      code: model.code,
      nameTh: model.nameTh,
      nameEn: model.nameEn,
      description: model.description,
      isActive: model.isActive,
      createdBy: model.createdBy,
      updatedBy: model.updatedBy,
      createdAt: model.createdAt,
      updatedAt: model.updatedAt,
    };
  }
}
