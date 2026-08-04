import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, SelectQueryBuilder } from 'typeorm';
import { LoadingPoint } from '../../entities/master/loading-point.entity';
import { CreateLoadingPointDto } from './dto/create-loading-point.dto';
import {
  ListLoadingPointsQueryDto,
  LoadingPointSortBy,
} from './dto/list-loading-points-query.dto';
import { UpdateLoadingPointDto } from './dto/update-loading-point.dto';

const LOADING_POINT_SORT_COLUMNS: Record<LoadingPointSortBy, string> = {
  code: 'loadingPoint.code',
  nameTh: 'loadingPoint.name_th',
  isActive: 'loadingPoint.is_active',
  createdAt: 'loadingPoint.created_at',
  updatedAt: 'loadingPoint.updated_at',
};

export type LoadingPointResponse = {
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
export class LoadingPointsService {
  constructor(
    @InjectRepository(LoadingPoint)
    private readonly loadingPointRepository: Repository<LoadingPoint>,
    private readonly dataSource: DataSource,
  ) {}

  async create(
    dto: CreateLoadingPointDto,
    userId: string,
  ): Promise<LoadingPointResponse> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(LoadingPoint);
      const normalizedCode = this.normalizeCode(dto.code);
      await this.assertCodeAvailable(repository, normalizedCode);

      const loadingPoint = repository.create({
        code: normalizedCode,
        nameTh: dto.nameTh.trim(),
        nameEn: this.toNullable(dto.nameEn),
        description: this.toNullable(dto.description),
        isActive: dto.isActive ?? true,
        createdBy: userId,
        updatedBy: userId,
      });
      const saved = await repository.save(loadingPoint);
      return this.toResponse(saved);
    });
  }

  async update(
    id: string,
    dto: UpdateLoadingPointDto,
    userId: string,
  ): Promise<LoadingPointResponse> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(LoadingPoint);
      const loadingPoint = await repository.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!loadingPoint) {
        throw new NotFoundException('Loading point not found');
      }
      if (
        new Date(dto.updatedAt).getTime() !==
        new Date(loadingPoint.updatedAt).getTime()
      ) {
        throw new ConflictException('Loading point has been updated');
      }

      const normalizedCode = dto.code
        ? this.normalizeCode(dto.code)
        : loadingPoint.code;
      if (dto.code) {
        await this.assertCodeAvailable(
          repository,
          normalizedCode,
          loadingPoint.id,
        );
      }

      if (dto.code !== undefined) loadingPoint.code = normalizedCode;
      if (dto.nameTh !== undefined) loadingPoint.nameTh = dto.nameTh.trim();
      if (dto.nameEn !== undefined) {
        loadingPoint.nameEn = this.toNullable(dto.nameEn);
      }
      if (dto.description !== undefined) {
        loadingPoint.description = this.toNullable(dto.description);
      }
      if (dto.isActive !== undefined) loadingPoint.isActive = dto.isActive;
      loadingPoint.updatedBy = userId;

      const saved = await repository.save(loadingPoint);
      return this.toResponse(saved);
    });
  }

  async deactivate(
    id: string,
    userId: string,
  ): Promise<LoadingPointResponse> {
    return this.setActive(id, false, userId);
  }

  async restore(id: string, userId: string): Promise<LoadingPointResponse> {
    return this.setActive(id, true, userId);
  }

  async findAll(query: ListLoadingPointsQueryDto): Promise<{
    items: LoadingPointResponse[];
    meta: { page: number; limit: number; totalItems: number; totalPages: number };
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const queryBuilder: SelectQueryBuilder<LoadingPoint> =
      this.loadingPointRepository.createQueryBuilder('loadingPoint');

    if (query.search) {
      queryBuilder.andWhere(
        '(loadingPoint.code ILIKE :search OR loadingPoint.name_th ILIKE :search OR loadingPoint.name_en ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }
    if (query.isActive !== undefined) {
      queryBuilder.andWhere('loadingPoint.is_active = :isActive', {
        isActive: query.isActive,
      });
    }

    const sortColumn =
      LOADING_POINT_SORT_COLUMNS[query.sortBy] ??
      LOADING_POINT_SORT_COLUMNS.code;
    const sortOrder = query.sortOrder === 'desc' ? 'DESC' : 'ASC';
    const [rows, totalItems] = await queryBuilder
      .orderBy(sortColumn, sortOrder)
      .addOrderBy('loadingPoint.id', 'ASC')
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

  async findOne(id: string): Promise<LoadingPointResponse> {
    const loadingPoint = await this.loadingPointRepository.findOne({
      where: { id },
    });
    if (!loadingPoint) {
      throw new NotFoundException('Loading point not found');
    }
    return this.toResponse(loadingPoint);
  }

  private async setActive(
    id: string,
    isActive: boolean,
    userId: string,
  ): Promise<LoadingPointResponse> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(LoadingPoint);
      const loadingPoint = await repository.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!loadingPoint) {
        throw new NotFoundException('Loading point not found');
      }
      loadingPoint.isActive = isActive;
      loadingPoint.updatedBy = userId;
      const saved = await repository.save(loadingPoint);
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
    repository: Repository<LoadingPoint>,
    code: string,
    currentId?: string,
  ): Promise<void> {
    const query = repository
      .createQueryBuilder('loadingPoint')
      .where('LOWER(loadingPoint.code) = LOWER(:code)', { code });
    if (currentId) {
      query.andWhere('loadingPoint.id <> :currentId', { currentId });
    }
    if (await query.getOne()) {
      throw new ConflictException('Loading point code already exists');
    }
  }

  private toResponse(loadingPoint: LoadingPoint): LoadingPointResponse {
    return {
      id: loadingPoint.id,
      code: loadingPoint.code,
      nameTh: loadingPoint.nameTh,
      nameEn: loadingPoint.nameEn,
      description: loadingPoint.description,
      isActive: loadingPoint.isActive,
      createdBy: loadingPoint.createdBy,
      updatedBy: loadingPoint.updatedBy,
      createdAt: loadingPoint.createdAt,
      updatedAt: loadingPoint.updatedAt,
    };
  }
}
