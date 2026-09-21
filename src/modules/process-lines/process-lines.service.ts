import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, SelectQueryBuilder } from 'typeorm';
import { ProcessLine } from '../../entities/master/process-line.entity';
import { CreateProcessLineDto } from './dto/create-process-line.dto';
import {
  ListProcessLinesQueryDto,
  ProcessLineSortBy,
} from './dto/list-process-lines-query.dto';
import { UpdateProcessLineDto } from './dto/update-process-line.dto';

const PROCESS_LINE_SORT_COLUMNS: Record<ProcessLineSortBy, string> = {
  code: 'processLine.code',
  nameTh: 'processLine.name_th',
  isActive: 'processLine.is_active',
  createdAt: 'processLine.created_at',
  updatedAt: 'processLine.updated_at',
};

export type ProcessLineResponse = {
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
export class ProcessLinesService {
  constructor(
    @InjectRepository(ProcessLine)
    private readonly processLineRepository: Repository<ProcessLine>,
    private readonly dataSource: DataSource,
  ) {}

  async create(
    dto: CreateProcessLineDto,
    userId: string,
  ): Promise<ProcessLineResponse> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(ProcessLine);
      const normalizedCode = this.normalizeCode(dto.code);
      await this.assertCodeAvailable(repository, normalizedCode);

      const processLine = repository.create({
        code: normalizedCode,
        nameTh: dto.nameTh.trim(),
        nameEn: this.toNullable(dto.nameEn),
        description: this.toNullable(dto.description),
        isActive: dto.isActive ?? true,
        createdBy: userId,
        updatedBy: userId,
      });
      const saved = await repository.save(processLine);
      return this.toResponse(saved);
    });
  }

  async update(
    id: string,
    dto: UpdateProcessLineDto,
    userId: string,
  ): Promise<ProcessLineResponse> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(ProcessLine);
      const processLine = await repository.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!processLine) {
        throw new NotFoundException('Process line not found');
      }
      if (
        new Date(dto.updatedAt).getTime() !==
        new Date(processLine.updatedAt).getTime()
      ) {
        throw new ConflictException('Process line has been updated');
      }

      const normalizedCode = dto.code
        ? this.normalizeCode(dto.code)
        : processLine.code;
      if (dto.code) {
        await this.assertCodeAvailable(
          repository,
          normalizedCode,
          processLine.id,
        );
      }

      if (dto.code !== undefined) processLine.code = normalizedCode;
      if (dto.nameTh !== undefined) processLine.nameTh = dto.nameTh.trim();
      if (dto.nameEn !== undefined) {
        processLine.nameEn = this.toNullable(dto.nameEn);
      }
      if (dto.description !== undefined) {
        processLine.description = this.toNullable(dto.description);
      }
      if (dto.isActive !== undefined) processLine.isActive = dto.isActive;
      processLine.updatedBy = userId;

      const saved = await repository.save(processLine);
      return this.toResponse(saved);
    });
  }

  async deactivate(id: string, userId: string): Promise<ProcessLineResponse> {
    return this.setActive(id, false, userId);
  }

  async restore(id: string, userId: string): Promise<ProcessLineResponse> {
    return this.setActive(id, true, userId);
  }

  async findAll(query: ListProcessLinesQueryDto): Promise<{
    items: ProcessLineResponse[];
    meta: {
      page: number;
      limit: number;
      totalItems: number;
      totalPages: number;
    };
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const queryBuilder: SelectQueryBuilder<ProcessLine> =
      this.processLineRepository.createQueryBuilder('processLine');

    if (query.search) {
      queryBuilder.andWhere(
        '(processLine.code ILIKE :search OR processLine.name_th ILIKE :search OR processLine.name_en ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }
    if (query.isActive !== undefined) {
      queryBuilder.andWhere('processLine.is_active = :isActive', {
        isActive: query.isActive,
      });
    }

    const sortColumn =
      PROCESS_LINE_SORT_COLUMNS[query.sortBy] ?? PROCESS_LINE_SORT_COLUMNS.code;
    const sortOrder = query.sortOrder === 'desc' ? 'DESC' : 'ASC';
    const [rows, totalItems] = await queryBuilder
      .orderBy(sortColumn, sortOrder)
      .addOrderBy('processLine.id', 'ASC')
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

  async findOne(id: string): Promise<ProcessLineResponse> {
    const processLine = await this.processLineRepository.findOne({
      where: { id },
    });
    if (!processLine) {
      throw new NotFoundException('Process line not found');
    }
    return this.toResponse(processLine);
  }

  private async setActive(
    id: string,
    isActive: boolean,
    userId: string,
  ): Promise<ProcessLineResponse> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(ProcessLine);
      const processLine = await repository.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!processLine) {
        throw new NotFoundException('Process line not found');
      }
      processLine.isActive = isActive;
      processLine.updatedBy = userId;
      const saved = await repository.save(processLine);
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
    repository: Repository<ProcessLine>,
    code: string,
    currentId?: string,
  ): Promise<void> {
    const query = repository
      .createQueryBuilder('processLine')
      .where('LOWER(processLine.code) = LOWER(:code)', { code });
    if (currentId) {
      query.andWhere('processLine.id <> :currentId', { currentId });
    }
    if (await query.getOne()) {
      throw new ConflictException('Process line code already exists');
    }
  }

  private toResponse(processLine: ProcessLine): ProcessLineResponse {
    return {
      id: processLine.id,
      code: processLine.code,
      nameTh: processLine.nameTh,
      nameEn: processLine.nameEn,
      description: processLine.description,
      isActive: processLine.isActive,
      createdBy: processLine.createdBy,
      updatedBy: processLine.updatedBy,
      createdAt: processLine.createdAt,
      updatedAt: processLine.updatedAt,
    };
  }
}
