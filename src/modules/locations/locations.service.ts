import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, SelectQueryBuilder } from 'typeorm';
import { Location } from '../../entities/master/location.entity';
import { CreateLocationDto } from './dto/create-location.dto';
import {
  ListLocationsQueryDto,
  LocationSortBy,
} from './dto/list-locations-query.dto';
import { UpdateLocationDto } from './dto/update-location.dto';

const LOCATION_SORT_COLUMNS: Record<LocationSortBy, string> = {
  code: 'location.code',
  nameTh: 'location.name_th',
  isActive: 'location.is_active',
  createdAt: 'location.created_at',
  updatedAt: 'location.updated_at',
};

export type LocationResponse = {
  id: string;
  code: string;
  nameTh: string;
  nameEn: string | null;
  zone: string | null;
  warehouse: string | null;
  description: string | null;
  isActive: boolean;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class LocationsService {
  constructor(
    @InjectRepository(Location)
    private readonly locationRepository: Repository<Location>,
    private readonly dataSource: DataSource,
  ) {}

  async create(
    dto: CreateLocationDto,
    userId: string,
  ): Promise<LocationResponse> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(Location);
      const normalizedCode = this.normalizeCode(dto.code);
      await this.assertCodeAvailable(repository, normalizedCode);

      const location = repository.create({
        code: normalizedCode,
        nameTh: dto.nameTh.trim(),
        nameEn: this.toNullable(dto.nameEn),
        zone: this.toNullable(dto.zone),
        warehouse: this.toNullable(dto.warehouse),
        description: this.toNullable(dto.description),
        isActive: dto.isActive ?? true,
        createdBy: userId,
        updatedBy: userId,
      });
      const saved = await repository.save(location);
      return this.toResponse(saved);
    });
  }

  async update(
    id: string,
    dto: UpdateLocationDto,
    userId: string,
  ): Promise<LocationResponse> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(Location);
      const location = await repository.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!location) {
        throw new NotFoundException('Location not found');
      }
      if (
        new Date(dto.updatedAt).getTime() !==
        new Date(location.updatedAt).getTime()
      ) {
        throw new ConflictException('Location has been updated');
      }

      const normalizedCode = dto.code
        ? this.normalizeCode(dto.code)
        : location.code;
      if (dto.code) {
        await this.assertCodeAvailable(repository, normalizedCode, location.id);
      }

      if (dto.code !== undefined) location.code = normalizedCode;
      if (dto.nameTh !== undefined) location.nameTh = dto.nameTh.trim();
      if (dto.nameEn !== undefined) {
        location.nameEn = this.toNullable(dto.nameEn);
      }
      if (dto.zone !== undefined) {
        location.zone = this.toNullable(dto.zone);
      }
      if (dto.warehouse !== undefined) {
        location.warehouse = this.toNullable(dto.warehouse);
      }
      if (dto.description !== undefined) {
        location.description = this.toNullable(dto.description);
      }
      if (dto.isActive !== undefined) location.isActive = dto.isActive;
      location.updatedBy = userId;

      const saved = await repository.save(location);
      return this.toResponse(saved);
    });
  }

  async deactivate(id: string, userId: string): Promise<LocationResponse> {
    return this.setActive(id, false, userId);
  }

  async restore(id: string, userId: string): Promise<LocationResponse> {
    return this.setActive(id, true, userId);
  }

  async findAll(query: ListLocationsQueryDto): Promise<{
    items: LocationResponse[];
    meta: {
      page: number;
      limit: number;
      totalItems: number;
      totalPages: number;
    };
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const queryBuilder: SelectQueryBuilder<Location> =
      this.locationRepository.createQueryBuilder('location');

    if (query.search) {
      queryBuilder.andWhere(
        '(location.code ILIKE :search OR location.name_th ILIKE :search OR location.name_en ILIKE :search OR location.zone ILIKE :search OR location.warehouse ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }
    if (query.isActive !== undefined) {
      queryBuilder.andWhere('location.is_active = :isActive', {
        isActive: query.isActive,
      });
    }

    const sortColumn =
      LOCATION_SORT_COLUMNS[query.sortBy] ?? LOCATION_SORT_COLUMNS.code;
    const sortOrder = query.sortOrder === 'desc' ? 'DESC' : 'ASC';
    const [rows, totalItems] = await queryBuilder
      .orderBy(sortColumn, sortOrder)
      .addOrderBy('location.id', 'ASC')
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

  async findOne(id: string): Promise<LocationResponse> {
    const location = await this.locationRepository.findOne({ where: { id } });
    if (!location) {
      throw new NotFoundException('Location not found');
    }
    return this.toResponse(location);
  }

  private async setActive(
    id: string,
    isActive: boolean,
    userId: string,
  ): Promise<LocationResponse> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(Location);
      const location = await repository.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!location) {
        throw new NotFoundException('Location not found');
      }
      location.isActive = isActive;
      location.updatedBy = userId;
      const saved = await repository.save(location);
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
    repository: Repository<Location>,
    code: string,
    currentId?: string,
  ): Promise<void> {
    const query = repository
      .createQueryBuilder('location')
      .where('LOWER(location.code) = LOWER(:code)', { code });
    if (currentId) {
      query.andWhere('location.id <> :currentId', { currentId });
    }
    if (await query.getOne()) {
      throw new ConflictException('Location code already exists');
    }
  }

  private toResponse(location: Location): LocationResponse {
    return {
      id: location.id,
      code: location.code,
      nameTh: location.nameTh,
      nameEn: location.nameEn,
      zone: location.zone,
      warehouse: location.warehouse,
      description: location.description,
      isActive: location.isActive,
      createdBy: location.createdBy,
      updatedBy: location.updatedBy,
      createdAt: location.createdAt,
      updatedAt: location.updatedAt,
    };
  }
}
