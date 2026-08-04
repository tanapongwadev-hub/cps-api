import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, SelectQueryBuilder } from 'typeorm';
import { DeliveryType } from '../../entities/master/delivery-type.entity';
import { CreateDeliveryTypeDto } from './dto/create-delivery-type.dto';
import {
  DeliveryTypeSortBy,
  ListDeliveryTypesQueryDto,
} from './dto/list-delivery-types-query.dto';
import { UpdateDeliveryTypeDto } from './dto/update-delivery-type.dto';

const DELIVERY_TYPE_SORT_COLUMNS: Record<DeliveryTypeSortBy, string> = {
  code: 'deliveryType.code',
  nameTh: 'deliveryType.name_th',
  isActive: 'deliveryType.is_active',
  createdAt: 'deliveryType.created_at',
  updatedAt: 'deliveryType.updated_at',
};

export type DeliveryTypeResponse = {
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
export class DeliveryTypesService {
  constructor(
    @InjectRepository(DeliveryType)
    private readonly deliveryTypeRepository: Repository<DeliveryType>,
    private readonly dataSource: DataSource,
  ) {}

  async create(
    dto: CreateDeliveryTypeDto,
    userId: string,
  ): Promise<DeliveryTypeResponse> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(DeliveryType);
      const normalizedCode = this.normalizeCode(dto.code);
      await this.assertCodeAvailable(repository, normalizedCode);

      const deliveryType = repository.create({
        code: normalizedCode,
        nameTh: dto.nameTh.trim(),
        nameEn: this.toNullable(dto.nameEn),
        description: this.toNullable(dto.description),
        isActive: dto.isActive ?? true,
        createdBy: userId,
        updatedBy: userId,
      });
      const saved = await repository.save(deliveryType);
      return this.toResponse(saved);
    });
  }

  async update(
    id: string,
    dto: UpdateDeliveryTypeDto,
    userId: string,
  ): Promise<DeliveryTypeResponse> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(DeliveryType);
      const deliveryType = await repository.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!deliveryType) {
        throw new NotFoundException('Delivery type not found');
      }
      if (
        new Date(dto.updatedAt).getTime() !==
        new Date(deliveryType.updatedAt).getTime()
      ) {
        throw new ConflictException('Delivery type has been updated');
      }

      const normalizedCode = dto.code
        ? this.normalizeCode(dto.code)
        : deliveryType.code;
      if (dto.code) {
        await this.assertCodeAvailable(
          repository,
          normalizedCode,
          deliveryType.id,
        );
      }

      if (dto.code !== undefined) deliveryType.code = normalizedCode;
      if (dto.nameTh !== undefined) deliveryType.nameTh = dto.nameTh.trim();
      if (dto.nameEn !== undefined) {
        deliveryType.nameEn = this.toNullable(dto.nameEn);
      }
      if (dto.description !== undefined) {
        deliveryType.description = this.toNullable(dto.description);
      }
      if (dto.isActive !== undefined) deliveryType.isActive = dto.isActive;
      deliveryType.updatedBy = userId;

      const saved = await repository.save(deliveryType);
      return this.toResponse(saved);
    });
  }

  async deactivate(
    id: string,
    userId: string,
  ): Promise<DeliveryTypeResponse> {
    return this.setActive(id, false, userId);
  }

  async restore(id: string, userId: string): Promise<DeliveryTypeResponse> {
    return this.setActive(id, true, userId);
  }

  async findAll(query: ListDeliveryTypesQueryDto): Promise<{
    items: DeliveryTypeResponse[];
    meta: { page: number; limit: number; totalItems: number; totalPages: number };
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const queryBuilder: SelectQueryBuilder<DeliveryType> =
      this.deliveryTypeRepository.createQueryBuilder('deliveryType');

    if (query.search) {
      queryBuilder.andWhere(
        '(deliveryType.code ILIKE :search OR deliveryType.name_th ILIKE :search OR deliveryType.name_en ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }
    if (query.isActive !== undefined) {
      queryBuilder.andWhere('deliveryType.is_active = :isActive', {
        isActive: query.isActive,
      });
    }

    const sortColumn =
      DELIVERY_TYPE_SORT_COLUMNS[query.sortBy] ??
      DELIVERY_TYPE_SORT_COLUMNS.code;
    const sortOrder = query.sortOrder === 'desc' ? 'DESC' : 'ASC';
    const [rows, totalItems] = await queryBuilder
      .orderBy(sortColumn, sortOrder)
      .addOrderBy('deliveryType.id', 'ASC')
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

  async findOne(id: string): Promise<DeliveryTypeResponse> {
    const deliveryType = await this.deliveryTypeRepository.findOne({
      where: { id },
    });
    if (!deliveryType) {
      throw new NotFoundException('Delivery type not found');
    }
    return this.toResponse(deliveryType);
  }

  private async setActive(
    id: string,
    isActive: boolean,
    userId: string,
  ): Promise<DeliveryTypeResponse> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(DeliveryType);
      const deliveryType = await repository.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!deliveryType) {
        throw new NotFoundException('Delivery type not found');
      }
      deliveryType.isActive = isActive;
      deliveryType.updatedBy = userId;
      const saved = await repository.save(deliveryType);
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
    repository: Repository<DeliveryType>,
    code: string,
    currentId?: string,
  ): Promise<void> {
    const query = repository
      .createQueryBuilder('deliveryType')
      .where('LOWER(deliveryType.code) = LOWER(:code)', { code });
    if (currentId) {
      query.andWhere('deliveryType.id <> :currentId', { currentId });
    }
    if (await query.getOne()) {
      throw new ConflictException('Delivery type code already exists');
    }
  }

  private toResponse(deliveryType: DeliveryType): DeliveryTypeResponse {
    return {
      id: deliveryType.id,
      code: deliveryType.code,
      nameTh: deliveryType.nameTh,
      nameEn: deliveryType.nameEn,
      description: deliveryType.description,
      isActive: deliveryType.isActive,
      createdBy: deliveryType.createdBy,
      updatedBy: deliveryType.updatedBy,
      createdAt: deliveryType.createdAt,
      updatedAt: deliveryType.updatedAt,
    };
  }
}
