import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, SelectQueryBuilder } from 'typeorm';
import { Unit } from '../../entities/master/unit.entity';
import { CreateUnitDto } from './dto/create-unit.dto';
import { ListUnitsQueryDto, UnitSortBy } from './dto/list-units-query.dto';
import { UpdateUnitDto } from './dto/update-unit.dto';

const UNIT_SORT_COLUMNS: Record<UnitSortBy, string> = {
  code: 'unit.code',
  nameTh: 'unit.nameTh',
  isActive: 'unit.isActive',
  createdAt: 'unit.createdAt',
  updatedAt: 'unit.updatedAt',
};

export type UnitResponse = {
  id: string;
  code: string;
  nameTh: string;
  nameEn: string | null;
  symbol: string | null;
  description: string | null;
  isActive: boolean;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class UnitsService {
  constructor(
    @InjectRepository(Unit)
    private readonly unitRepository: Repository<Unit>,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateUnitDto, userId: string): Promise<UnitResponse> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(Unit);
      const normalizedCode = this.normalizeCode(dto.code);
      await this.assertCodeAvailable(repository, normalizedCode);

      const unit = repository.create({
        code: normalizedCode,
        nameTh: dto.nameTh.trim(),
        nameEn: dto.nameEn?.trim() ? dto.nameEn.trim() : null,
        symbol: dto.symbol?.trim() ? dto.symbol.trim() : null,
        description: dto.description?.trim() ? dto.description.trim() : null,
        isActive: dto.isActive ?? true,
        createdBy: userId,
        updatedBy: userId,
      });
      const saved = await repository.save(unit);
      return this.toResponse(saved);
    });
  }

  async update(
    id: string,
    dto: UpdateUnitDto,
    userId: string,
  ): Promise<UnitResponse> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(Unit);
      const unit = await repository.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!unit) {
        throw new NotFoundException('Unit not found');
      }
      if (
        new Date(dto.updatedAt).getTime() !== new Date(unit.updatedAt).getTime()
      ) {
        throw new ConflictException('Unit has been updated');
      }

      const normalizedCode = dto.code
        ? this.normalizeCode(dto.code)
        : unit.code;
      if (dto.code) {
        await this.assertCodeAvailable(repository, normalizedCode, unit.id);
      }

      if (dto.code !== undefined) unit.code = normalizedCode;
      if (dto.nameTh !== undefined) unit.nameTh = dto.nameTh.trim();
      if (dto.nameEn !== undefined) {
        unit.nameEn = dto.nameEn?.trim() ? dto.nameEn.trim() : null;
      }
      if (dto.symbol !== undefined) {
        unit.symbol = dto.symbol?.trim() ? dto.symbol.trim() : null;
      }
      if (dto.description !== undefined) {
        unit.description = dto.description?.trim()
          ? dto.description.trim()
          : null;
      }
      if (dto.isActive !== undefined) unit.isActive = dto.isActive;
      unit.updatedBy = userId;

      const saved = await repository.save(unit);
      return this.toResponse(saved);
    });
  }

  async deactivate(id: string, userId: string): Promise<UnitResponse> {
    return this.setActive(id, false, userId);
  }

  async restore(id: string, userId: string): Promise<UnitResponse> {
    return this.setActive(id, true, userId);
  }

  async findAll(query: ListUnitsQueryDto): Promise<{
    items: UnitResponse[];
    meta: {
      page: number;
      limit: number;
      totalItems: number;
      totalPages: number;
    };
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const queryBuilder: SelectQueryBuilder<Unit> =
      this.unitRepository.createQueryBuilder('unit');

    if (query.search) {
      queryBuilder.andWhere(
        '(unit.code ILIKE :search OR unit.name_th ILIKE :search OR unit.name_en ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }
    if (query.isActive !== undefined) {
      queryBuilder.andWhere('unit.is_active = :isActive', {
        isActive: query.isActive,
      });
    }

    const sortColumn =
      UNIT_SORT_COLUMNS[query.sortBy] ?? UNIT_SORT_COLUMNS.code;
    const sortOrder = query.sortOrder === 'desc' ? 'DESC' : 'ASC';
    const [rows, totalItems] = await queryBuilder
      .orderBy(sortColumn, sortOrder)
      .addOrderBy('unit.id', 'ASC')
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

  async findOne(id: string): Promise<UnitResponse> {
    const unit = await this.unitRepository.findOne({ where: { id } });
    if (!unit) {
      throw new NotFoundException('Unit not found');
    }
    return this.toResponse(unit);
  }

  private async setActive(
    id: string,
    isActive: boolean,
    userId: string,
  ): Promise<UnitResponse> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(Unit);
      const unit = await repository.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!unit) {
        throw new NotFoundException('Unit not found');
      }
      unit.isActive = isActive;
      unit.updatedBy = userId;
      const saved = await repository.save(unit);
      return this.toResponse(saved);
    });
  }

  private normalizeCode(code: string): string {
    return code.trim().toUpperCase();
  }

  private async assertCodeAvailable(
    repository: Repository<Unit>,
    code: string,
    currentId?: string,
  ): Promise<void> {
    const query = repository
      .createQueryBuilder('unit')
      .where('LOWER(unit.code) = LOWER(:code)', { code });
    if (currentId) {
      query.andWhere('unit.id <> :currentId', { currentId });
    }
    if (await query.getOne()) {
      throw new ConflictException('Unit code already exists');
    }
  }

  private toResponse(unit: Unit): UnitResponse {
    return {
      id: unit.id,
      code: unit.code,
      nameTh: unit.nameTh,
      nameEn: unit.nameEn,
      symbol: unit.symbol,
      description: unit.description,
      isActive: unit.isActive,
      createdBy: unit.createdBy,
      updatedBy: unit.updatedBy,
      createdAt: unit.createdAt,
      updatedAt: unit.updatedAt,
    };
  }
}
