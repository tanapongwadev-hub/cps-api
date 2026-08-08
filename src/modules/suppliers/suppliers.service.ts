import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, SelectQueryBuilder } from 'typeorm';
import { SupplierMaterial } from '../../entities/master/supplier-material.entity';
import { Supplier } from '../../entities/master/supplier.entity';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import {
  ListSuppliersQueryDto,
  SupplierSortBy,
} from './dto/list-suppliers-query.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';

const SUPPLIER_SORT_COLUMNS: Record<SupplierSortBy, string> = {
  code: 'supplier.code',
  nameTh: 'supplier.name_th',
  isActive: 'supplier.is_active',
  createdAt: 'supplier.created_at',
  updatedAt: 'supplier.updated_at',
};

export type SupplierResponse = {
  id: string;
  code: string;
  nameTh: string;
  nameEn: string | null;
  taxId: string | null;
  contactName: string | null;
  telephone: string | null;
  email: string | null;
  address: string | null;
  isActive: boolean;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class SuppliersService {
  constructor(
    @InjectRepository(Supplier)
    private readonly supplierRepository: Repository<Supplier>,
    private readonly dataSource: DataSource,
  ) {}

  async create(
    dto: CreateSupplierDto,
    userId: string,
  ): Promise<SupplierResponse> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(Supplier);
      const normalizedCode = this.normalizeCode(dto.code);
      await this.assertCodeAvailable(repository, normalizedCode);

      const supplier = repository.create({
        code: normalizedCode,
        nameTh: dto.nameTh.trim(),
        nameEn: this.toNullable(dto.nameEn),
        taxId: this.toNullable(dto.taxId),
        contactName: this.toNullable(dto.contactName),
        telephone: this.toNullable(dto.telephone),
        email: this.toNullable(dto.email),
        address: this.toNullable(dto.address),
        isActive: dto.isActive ?? true,
        createdBy: userId,
        updatedBy: userId,
      });
      const saved = await repository.save(supplier);
      return this.toResponse(saved);
    });
  }

  async update(
    id: string,
    dto: UpdateSupplierDto,
    userId: string,
  ): Promise<SupplierResponse> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(Supplier);
      const supplier = await repository.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!supplier) {
        throw new NotFoundException('Supplier not found');
      }
      if (
        new Date(dto.updatedAt).getTime() !==
        new Date(supplier.updatedAt).getTime()
      ) {
        throw new ConflictException('Supplier has been updated');
      }

      const normalizedCode = dto.code
        ? this.normalizeCode(dto.code)
        : supplier.code;
      if (dto.code) {
        await this.assertCodeAvailable(repository, normalizedCode, supplier.id);
      }

      if (dto.code !== undefined) supplier.code = normalizedCode;
      if (dto.nameTh !== undefined) supplier.nameTh = dto.nameTh.trim();
      if (dto.nameEn !== undefined) {
        supplier.nameEn = this.toNullable(dto.nameEn);
      }
      if (dto.taxId !== undefined) {
        supplier.taxId = this.toNullable(dto.taxId);
      }
      if (dto.contactName !== undefined) {
        supplier.contactName = this.toNullable(dto.contactName);
      }
      if (dto.telephone !== undefined) {
        supplier.telephone = this.toNullable(dto.telephone);
      }
      if (dto.email !== undefined) {
        supplier.email = this.toNullable(dto.email);
      }
      if (dto.address !== undefined) {
        supplier.address = this.toNullable(dto.address);
      }
      if (dto.isActive !== undefined) supplier.isActive = dto.isActive;
      supplier.updatedBy = userId;

      const saved = await repository.save(supplier);
      return this.toResponse(saved);
    });
  }

  async deactivate(id: string, userId: string): Promise<SupplierResponse> {
    return this.dataSource.transaction(async (manager) => {
      const supplierRepository = manager.getRepository(Supplier);
      const supplierMaterialRepository =
        manager.getRepository(SupplierMaterial);
      const supplier = await supplierRepository.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!supplier) {
        throw new NotFoundException('Supplier not found');
      }

      const activeReferences = await supplierMaterialRepository.count({
        where: { supplierId: id, isActive: true },
      });
      if (activeReferences > 0) {
        throw new UnprocessableEntityException(
          'ไม่สามารถปิดใช้งาน Supplier ที่ถูกใช้งานใน Material อยู่',
        );
      }

      supplier.isActive = false;
      supplier.updatedBy = userId;
      const saved = await supplierRepository.save(supplier);
      return this.toResponse(saved);
    });
  }

  async restore(id: string, userId: string): Promise<SupplierResponse> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(Supplier);
      const supplier = await repository.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!supplier) {
        throw new NotFoundException('Supplier not found');
      }
      supplier.isActive = true;
      supplier.updatedBy = userId;
      const saved = await repository.save(supplier);
      return this.toResponse(saved);
    });
  }

  async findAll(query: ListSuppliersQueryDto): Promise<{
    items: SupplierResponse[];
    meta: {
      page: number;
      limit: number;
      totalItems: number;
      totalPages: number;
    };
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const queryBuilder: SelectQueryBuilder<Supplier> =
      this.supplierRepository.createQueryBuilder('supplier');

    if (query.search) {
      queryBuilder.andWhere(
        '(supplier.code ILIKE :search OR supplier.name_th ILIKE :search OR supplier.name_en ILIKE :search OR supplier.tax_id ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }
    if (query.isActive !== undefined) {
      queryBuilder.andWhere('supplier.is_active = :isActive', {
        isActive: query.isActive,
      });
    }

    const sortColumn =
      SUPPLIER_SORT_COLUMNS[query.sortBy] ?? SUPPLIER_SORT_COLUMNS.code;
    const sortOrder = query.sortOrder === 'desc' ? 'DESC' : 'ASC';
    const [rows, totalItems] = await queryBuilder
      .orderBy(sortColumn, sortOrder)
      .addOrderBy('supplier.id', 'ASC')
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

  async findOne(id: string): Promise<SupplierResponse> {
    const supplier = await this.supplierRepository.findOne({ where: { id } });
    if (!supplier) {
      throw new NotFoundException('Supplier not found');
    }
    return this.toResponse(supplier);
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
    repository: Repository<Supplier>,
    code: string,
    currentId?: string,
  ): Promise<void> {
    const query = repository
      .createQueryBuilder('supplier')
      .where('LOWER(supplier.code) = LOWER(:code)', { code });
    if (currentId) {
      query.andWhere('supplier.id <> :currentId', { currentId });
    }
    if (await query.getOne()) {
      throw new ConflictException('Supplier code already exists');
    }
  }

  private toResponse(supplier: Supplier): SupplierResponse {
    return {
      id: supplier.id,
      code: supplier.code,
      nameTh: supplier.nameTh,
      nameEn: supplier.nameEn,
      taxId: supplier.taxId,
      contactName: supplier.contactName,
      telephone: supplier.telephone,
      email: supplier.email,
      address: supplier.address,
      isActive: supplier.isActive,
      createdBy: supplier.createdBy,
      updatedBy: supplier.updatedBy,
      createdAt: supplier.createdAt,
      updatedAt: supplier.updatedAt,
    };
  }
}
