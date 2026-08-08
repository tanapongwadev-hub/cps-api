import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, SelectQueryBuilder } from 'typeorm';
import { StatusItem } from '../../entities/master/status-item.entity';
import { CreateStatusItemDto } from './dto/create-status-item.dto';
import {
  ListStatusItemsQueryDto,
  StatusItemSortBy,
} from './dto/list-status-items-query.dto';
import { UpdateStatusItemDto } from './dto/update-status-item.dto';

const STATUS_ITEM_SORT_COLUMNS: Record<StatusItemSortBy, string> = {
  code: 'statusItem.code',
  nameTh: 'statusItem.name_th',
  module: 'statusItem.module',
  sortOrder: 'statusItem.sort_order',
  isActive: 'statusItem.is_active',
  createdAt: 'statusItem.created_at',
  updatedAt: 'statusItem.updated_at',
};

export type StatusItemResponse = {
  id: string;
  code: string;
  nameTh: string;
  nameEn: string | null;
  color: string;
  module: string;
  isDefault: boolean;
  sortOrder: number;
  description: string | null;
  isActive: boolean;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class StatusItemsService {
  constructor(
    @InjectRepository(StatusItem)
    private readonly repo: Repository<StatusItem>,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateStatusItemDto, userId: string) {
    return this.dataSource.transaction(async (manager) => {
      const r = manager.getRepository(StatusItem);
      const code = this.normalize(dto.code);
      await this.assertCodeAvailable(r, code);
      const saved = await r.save(
        r.create({
          code,
          nameTh: dto.nameTh.trim(),
          nameEn: this.toNullable(dto.nameEn),
          color: dto.color ?? 'info',
          module: dto.module.trim(),
          isDefault: dto.isDefault ?? false,
          sortOrder: dto.sortOrder ?? 0,
          description: this.toNullable(dto.description),
          isActive: dto.isActive ?? true,
          createdBy: userId,
          updatedBy: userId,
        }),
      );
      return this.toResponse(saved);
    });
  }

  async update(id: string, dto: UpdateStatusItemDto, userId: string) {
    return this.dataSource.transaction(async (manager) => {
      const r = manager.getRepository(StatusItem);
      const s = await r.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!s) throw new NotFoundException('Status item not found');
      if (
        new Date(dto.updatedAt).getTime() !== new Date(s.updatedAt).getTime()
      ) {
        throw new ConflictException('Status item has been updated');
      }
      const code = dto.code ? this.normalize(dto.code) : s.code;
      if (dto.code) await this.assertCodeAvailable(r, code, s.id);
      if (dto.code !== undefined) s.code = code;
      if (dto.nameTh !== undefined) s.nameTh = dto.nameTh.trim();
      if (dto.nameEn !== undefined) s.nameEn = this.toNullable(dto.nameEn);
      if (dto.color !== undefined) s.color = dto.color;
      if (dto.module !== undefined) s.module = dto.module.trim();
      if (dto.isDefault !== undefined) s.isDefault = dto.isDefault;
      if (dto.sortOrder !== undefined) s.sortOrder = dto.sortOrder;
      if (dto.description !== undefined)
        s.description = this.toNullable(dto.description);
      if (dto.isActive !== undefined) s.isActive = dto.isActive;
      s.updatedBy = userId;
      const saved = await r.save(s);
      return this.toResponse(saved);
    });
  }

  async deactivate(id: string, userId: string) {
    return this.setActive(id, false, userId);
  }
  async restore(id: string, userId: string) {
    return this.setActive(id, true, userId);
  }

  async findAll(query: ListStatusItemsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const qb: SelectQueryBuilder<StatusItem> =
      this.repo.createQueryBuilder('statusItem');
    if (query.search) {
      qb.andWhere(
        '(statusItem.code ILIKE :s OR statusItem.name_th ILIKE :s OR statusItem.name_en ILIKE :s)',
        { s: `%${query.search}%` },
      );
    }
    if (query.isActive !== undefined)
      qb.andWhere('statusItem.is_active = :a', { a: query.isActive });
    if (query.module)
      qb.andWhere('statusItem.module = :m', { m: query.module });
    const sortColumn =
      STATUS_ITEM_SORT_COLUMNS[query.sortBy] ??
      STATUS_ITEM_SORT_COLUMNS.sortOrder;
    const sortOrder = query.sortOrder === 'desc' ? 'DESC' : 'ASC';
    const [rows, total] = await qb
      .orderBy(sortColumn, sortOrder)
      .addOrderBy('statusItem.id', 'ASC')
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
    const s = await this.repo.findOne({ where: { id } });
    if (!s) throw new NotFoundException('Status item not found');
    return this.toResponse(s);
  }

  private async setActive(id: string, isActive: boolean, userId: string) {
    return this.dataSource.transaction(async (manager) => {
      const r = manager.getRepository(StatusItem);
      const s = await r.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!s) throw new NotFoundException('Status item not found');
      s.isActive = isActive;
      s.updatedBy = userId;
      const saved = await r.save(s);
      return this.toResponse(saved);
    });
  }

  private normalize(code: string) {
    return code.trim().toUpperCase();
  }
  private toNullable(v: string | null | undefined) {
    if (v === null || v === undefined) return null;
    const t = v.trim();
    return t === '' ? null : t;
  }
  private async assertCodeAvailable(
    r: Repository<StatusItem>,
    code: string,
    currentId?: string,
  ) {
    const q = r
      .createQueryBuilder('s')
      .where('LOWER(s.code) = LOWER(:c)', { c: code });
    if (currentId) q.andWhere('s.id <> :id', { id: currentId });
    if (await q.getOne())
      throw new ConflictException('Status item code already exists');
  }
  private toResponse(s: StatusItem): StatusItemResponse {
    return {
      id: s.id,
      code: s.code,
      nameTh: s.nameTh,
      nameEn: s.nameEn,
      color: s.color,
      module: s.module,
      isDefault: s.isDefault,
      sortOrder: s.sortOrder,
      description: s.description,
      isActive: s.isActive,
      createdBy: s.createdBy,
      updatedBy: s.updatedBy,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    };
  }
}
