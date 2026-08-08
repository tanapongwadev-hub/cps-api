import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, SelectQueryBuilder } from 'typeorm';
import { RejectReason } from '../../entities/master/reject-reason.entity';
import { CreateRejectReasonDto } from './dto/create-reject-reason.dto';
import {
  ListRejectReasonsQueryDto,
  RejectReasonSortBy,
} from './dto/list-reject-reasons-query.dto';
import { UpdateRejectReasonDto } from './dto/update-reject-reason.dto';

const REJECT_REASON_SORT_COLUMNS: Record<RejectReasonSortBy, string> = {
  code: 'rejectReason.code',
  nameTh: 'rejectReason.name_th',
  isActive: 'rejectReason.is_active',
  createdAt: 'rejectReason.created_at',
  updatedAt: 'rejectReason.updated_at',
};

export type RejectReasonResponse = {
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
export class RejectReasonsService {
  constructor(
    @InjectRepository(RejectReason)
    private readonly rejectReasonRepository: Repository<RejectReason>,
    private readonly dataSource: DataSource,
  ) {}

  async create(
    dto: CreateRejectReasonDto,
    userId: string,
  ): Promise<RejectReasonResponse> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(RejectReason);
      const normalizedCode = this.normalizeCode(dto.code);
      await this.assertCodeAvailable(repository, normalizedCode);

      const rejectReason = repository.create({
        code: normalizedCode,
        nameTh: dto.nameTh.trim(),
        nameEn: this.toNullable(dto.nameEn),
        description: this.toNullable(dto.description),
        isActive: dto.isActive ?? true,
        createdBy: userId,
        updatedBy: userId,
      });
      const saved = await this.save(repository, rejectReason);
      return this.toResponse(saved);
    });
  }

  async update(
    id: string,
    dto: UpdateRejectReasonDto,
    userId: string,
  ): Promise<RejectReasonResponse> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(RejectReason);
      const rejectReason = await repository.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!rejectReason) {
        throw new NotFoundException('Reject reason not found');
      }
      if (
        new Date(dto.updatedAt).getTime() !==
        new Date(rejectReason.updatedAt).getTime()
      ) {
        throw new ConflictException('Reject reason has been updated');
      }

      const normalizedCode = dto.code
        ? this.normalizeCode(dto.code)
        : rejectReason.code;
      if (dto.code) {
        await this.assertCodeAvailable(
          repository,
          normalizedCode,
          rejectReason.id,
        );
      }

      if (dto.code !== undefined) rejectReason.code = normalizedCode;
      if (dto.nameTh !== undefined) rejectReason.nameTh = dto.nameTh.trim();
      if (dto.nameEn !== undefined) {
        rejectReason.nameEn = this.toNullable(dto.nameEn);
      }
      if (dto.description !== undefined) {
        rejectReason.description = this.toNullable(dto.description);
      }
      if (dto.isActive !== undefined) rejectReason.isActive = dto.isActive;
      rejectReason.updatedBy = userId;

      const saved = await this.save(repository, rejectReason);
      return this.toResponse(saved);
    });
  }

  async deactivate(id: string, userId: string): Promise<RejectReasonResponse> {
    return this.setActive(id, false, userId);
  }

  async restore(id: string, userId: string): Promise<RejectReasonResponse> {
    return this.setActive(id, true, userId);
  }

  async findAll(query: ListRejectReasonsQueryDto): Promise<{
    items: RejectReasonResponse[];
    meta: {
      page: number;
      limit: number;
      totalItems: number;
      totalPages: number;
    };
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const queryBuilder: SelectQueryBuilder<RejectReason> =
      this.rejectReasonRepository.createQueryBuilder('rejectReason');

    if (query.search) {
      queryBuilder.andWhere(
        '(rejectReason.code ILIKE :search OR rejectReason.name_th ILIKE :search OR rejectReason.name_en ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }
    if (query.isActive !== undefined) {
      queryBuilder.andWhere('rejectReason.is_active = :isActive', {
        isActive: query.isActive,
      });
    }

    const sortColumn =
      REJECT_REASON_SORT_COLUMNS[query.sortBy] ??
      REJECT_REASON_SORT_COLUMNS.code;
    const sortOrder = query.sortOrder === 'desc' ? 'DESC' : 'ASC';
    const [rows, totalItems] = await queryBuilder
      .orderBy(sortColumn, sortOrder)
      .addOrderBy('rejectReason.id', 'ASC')
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

  async findOne(id: string): Promise<RejectReasonResponse> {
    const rejectReason = await this.rejectReasonRepository.findOne({
      where: { id },
    });
    if (!rejectReason) {
      throw new NotFoundException('Reject reason not found');
    }
    return this.toResponse(rejectReason);
  }

  private async setActive(
    id: string,
    isActive: boolean,
    userId: string,
  ): Promise<RejectReasonResponse> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(RejectReason);
      const rejectReason = await repository.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!rejectReason) {
        throw new NotFoundException('Reject reason not found');
      }
      rejectReason.isActive = isActive;
      rejectReason.updatedBy = userId;
      const saved = await this.save(repository, rejectReason);
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
    repository: Repository<RejectReason>,
    code: string,
    currentId?: string,
  ): Promise<void> {
    const query = repository
      .createQueryBuilder('rejectReason')
      .where('LOWER(rejectReason.code) = LOWER(:code)', { code });
    if (currentId) {
      query.andWhere('rejectReason.id <> :currentId', { currentId });
    }
    if (await query.getOne()) {
      throw new ConflictException('Reject reason code already exists');
    }
  }

  private async save(
    repository: Repository<RejectReason>,
    rejectReason: RejectReason,
  ): Promise<RejectReason> {
    try {
      return await repository.save(rejectReason);
    } catch (error) {
      const databaseError = error as {
        code?: string;
        driverError?: { code?: string };
      };
      if (
        databaseError.code === '23505' ||
        databaseError.driverError?.code === '23505'
      ) {
        throw new ConflictException('Reject reason code already exists');
      }
      throw error;
    }
  }

  private toResponse(rejectReason: RejectReason): RejectReasonResponse {
    return {
      id: rejectReason.id,
      code: rejectReason.code,
      nameTh: rejectReason.nameTh,
      nameEn: rejectReason.nameEn,
      description: rejectReason.description,
      isActive: rejectReason.isActive,
      createdBy: rejectReason.createdBy,
      updatedBy: rejectReason.updatedBy,
      createdAt: rejectReason.createdAt,
      updatedAt: rejectReason.updatedAt,
    };
  }
}
