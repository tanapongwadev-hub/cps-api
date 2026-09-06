import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, SelectQueryBuilder } from 'typeorm';
import { ProcessStep } from '../../entities/master/process-step.entity';
import { CreateProcessStepDto } from './dto/create-process-step.dto';
import {
  ProcessStepSortBy,
  ListProcessStepsQueryDto,
} from './dto/list-process-steps-query.dto';
import { UpdateProcessStepDto } from './dto/update-process-step.dto';

const PROCESS_STEP_SORT_COLUMNS: Record<ProcessStepSortBy, string> = {
  code: 'processStep.code',
  nameTh: 'processStep.name_th',
  isActive: 'processStep.is_active',
  createdAt: 'processStep.created_at',
  updatedAt: 'processStep.updated_at',
};

export type ProcessStepResponse = {
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
export class ProcessStepsService {
  constructor(
    @InjectRepository(ProcessStep)
    private readonly processStepRepository: Repository<ProcessStep>,
    private readonly dataSource: DataSource,
  ) {}

  async create(
    dto: CreateProcessStepDto,
    userId: string,
  ): Promise<ProcessStepResponse> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(ProcessStep);
      const normalizedCode = this.normalizeCode(dto.code);
      await this.assertCodeAvailable(repository, normalizedCode);

      const processStep = repository.create({
        code: normalizedCode,
        nameTh: dto.nameTh.trim(),
        nameEn: this.toNullable(dto.nameEn),
        description: this.toNullable(dto.description),
        isActive: dto.isActive ?? true,
        createdBy: userId,
        updatedBy: userId,
      });
      const saved = await repository.save(processStep);
      return this.toResponse(saved);
    });
  }

  async update(
    id: string,
    dto: UpdateProcessStepDto,
    userId: string,
  ): Promise<ProcessStepResponse> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(ProcessStep);
      const processStep = await repository.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!processStep) {
        throw new NotFoundException('Process step not found');
      }
      if (
        new Date(dto.updatedAt).getTime() !==
        new Date(processStep.updatedAt).getTime()
      ) {
        throw new ConflictException('Process step has been updated');
      }

      const normalizedCode = dto.code
        ? this.normalizeCode(dto.code)
        : processStep.code;
      if (dto.code) {
        await this.assertCodeAvailable(
          repository,
          normalizedCode,
          processStep.id,
        );
      }

      if (dto.code !== undefined) processStep.code = normalizedCode;
      if (dto.nameTh !== undefined) processStep.nameTh = dto.nameTh.trim();
      if (dto.nameEn !== undefined) {
        processStep.nameEn = this.toNullable(dto.nameEn);
      }
      if (dto.description !== undefined) {
        processStep.description = this.toNullable(dto.description);
      }
      if (dto.isActive !== undefined) processStep.isActive = dto.isActive;
      processStep.updatedBy = userId;

      const saved = await repository.save(processStep);
      return this.toResponse(saved);
    });
  }

  async deactivate(id: string, userId: string): Promise<ProcessStepResponse> {
    return this.setActive(id, false, userId);
  }

  async restore(id: string, userId: string): Promise<ProcessStepResponse> {
    return this.setActive(id, true, userId);
  }

  async findAll(query: ListProcessStepsQueryDto): Promise<{
    items: ProcessStepResponse[];
    meta: {
      page: number;
      limit: number;
      totalItems: number;
      totalPages: number;
    };
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const queryBuilder: SelectQueryBuilder<ProcessStep> =
      this.processStepRepository.createQueryBuilder('processStep');

    if (query.search) {
      queryBuilder.andWhere(
        '(processStep.code ILIKE :search OR processStep.name_th ILIKE :search OR processStep.name_en ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }
    if (query.isActive !== undefined) {
      queryBuilder.andWhere('processStep.is_active = :isActive', {
        isActive: query.isActive,
      });
    }

    const sortColumn =
      PROCESS_STEP_SORT_COLUMNS[query.sortBy] ?? PROCESS_STEP_SORT_COLUMNS.code;
    const sortOrder = query.sortOrder === 'desc' ? 'DESC' : 'ASC';
    const [rows, totalItems] = await queryBuilder
      .orderBy(sortColumn, sortOrder)
      .addOrderBy('processStep.id', 'ASC')
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

  async findOne(id: string): Promise<ProcessStepResponse> {
    const processStep = await this.processStepRepository.findOne({
      where: { id },
    });
    if (!processStep) {
      throw new NotFoundException('Process step not found');
    }
    return this.toResponse(processStep);
  }

  private async setActive(
    id: string,
    isActive: boolean,
    userId: string,
  ): Promise<ProcessStepResponse> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(ProcessStep);
      const processStep = await repository.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!processStep) {
        throw new NotFoundException('Process step not found');
      }
      processStep.isActive = isActive;
      processStep.updatedBy = userId;
      const saved = await repository.save(processStep);
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
    repository: Repository<ProcessStep>,
    code: string,
    currentId?: string,
  ): Promise<void> {
    const query = repository
      .createQueryBuilder('processStep')
      .where('LOWER(processStep.code) = LOWER(:code)', { code });
    if (currentId) {
      query.andWhere('processStep.id <> :currentId', { currentId });
    }
    if (await query.getOne()) {
      throw new ConflictException('Process step code already exists');
    }
  }

  private toResponse(processStep: ProcessStep): ProcessStepResponse {
    return {
      id: processStep.id,
      code: processStep.code,
      nameTh: processStep.nameTh,
      nameEn: processStep.nameEn,
      description: processStep.description,
      isActive: processStep.isActive,
      createdBy: processStep.createdBy,
      updatedBy: processStep.updatedBy,
      createdAt: processStep.createdAt,
      updatedAt: processStep.updatedAt,
    };
  }
}
