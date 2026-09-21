import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, SelectQueryBuilder } from 'typeorm';
import { Customer } from '../../entities/master/customer.entity';
import { CreateCustomerDto } from './dto/create-customer.dto';
import {
  CustomerSortBy,
  ListCustomersQueryDto,
} from './dto/list-customers-query.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

const CUSTOMER_SORT_COLUMNS: Record<CustomerSortBy, string> = {
  code: 'customer.code',
  nameTh: 'customer.name_th',
  isActive: 'customer.is_active',
  createdAt: 'customer.created_at',
  updatedAt: 'customer.updated_at',
};

export type CustomerResponse = {
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
export class CustomersService {
  constructor(
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    private readonly dataSource: DataSource,
  ) {}

  async create(
    dto: CreateCustomerDto,
    userId: string,
  ): Promise<CustomerResponse> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(Customer);
      const normalizedCode = this.normalizeCode(dto.code);
      await this.assertCodeAvailable(repository, normalizedCode);

      const customer = repository.create({
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
      const saved = await repository.save(customer);
      return this.toResponse(saved);
    });
  }

  async update(
    id: string,
    dto: UpdateCustomerDto,
    userId: string,
  ): Promise<CustomerResponse> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(Customer);
      const customer = await repository.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!customer) {
        throw new NotFoundException('Customer not found');
      }
      if (
        new Date(dto.updatedAt).getTime() !==
        new Date(customer.updatedAt).getTime()
      ) {
        throw new ConflictException('Customer has been updated');
      }

      const normalizedCode = dto.code
        ? this.normalizeCode(dto.code)
        : customer.code;
      if (dto.code) {
        await this.assertCodeAvailable(repository, normalizedCode, customer.id);
      }

      if (dto.code !== undefined) customer.code = normalizedCode;
      if (dto.nameTh !== undefined) customer.nameTh = dto.nameTh.trim();
      if (dto.nameEn !== undefined) {
        customer.nameEn = this.toNullable(dto.nameEn);
      }
      if (dto.taxId !== undefined) {
        customer.taxId = this.toNullable(dto.taxId);
      }
      if (dto.contactName !== undefined) {
        customer.contactName = this.toNullable(dto.contactName);
      }
      if (dto.telephone !== undefined) {
        customer.telephone = this.toNullable(dto.telephone);
      }
      if (dto.email !== undefined) {
        customer.email = this.toNullable(dto.email);
      }
      if (dto.address !== undefined) {
        customer.address = this.toNullable(dto.address);
      }
      if (dto.isActive !== undefined) customer.isActive = dto.isActive;
      customer.updatedBy = userId;

      const saved = await repository.save(customer);
      return this.toResponse(saved);
    });
  }

  async deactivate(id: string, userId: string): Promise<CustomerResponse> {
    return this.setActive(id, false, userId);
  }

  async restore(id: string, userId: string): Promise<CustomerResponse> {
    return this.setActive(id, true, userId);
  }

  async findAll(query: ListCustomersQueryDto): Promise<{
    items: CustomerResponse[];
    meta: {
      page: number;
      limit: number;
      totalItems: number;
      totalPages: number;
    };
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const queryBuilder: SelectQueryBuilder<Customer> =
      this.customerRepository.createQueryBuilder('customer');

    if (query.search) {
      queryBuilder.andWhere(
        '(customer.code ILIKE :search OR customer.name_th ILIKE :search OR customer.name_en ILIKE :search OR customer.tax_id ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }
    if (query.isActive !== undefined) {
      queryBuilder.andWhere('customer.is_active = :isActive', {
        isActive: query.isActive,
      });
    }

    const sortColumn =
      CUSTOMER_SORT_COLUMNS[query.sortBy] ?? CUSTOMER_SORT_COLUMNS.code;
    const sortOrder = query.sortOrder === 'desc' ? 'DESC' : 'ASC';
    const [rows, totalItems] = await queryBuilder
      .orderBy(sortColumn, sortOrder)
      .addOrderBy('customer.id', 'ASC')
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

  async findOne(id: string): Promise<CustomerResponse> {
    const customer = await this.customerRepository.findOne({ where: { id } });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }
    return this.toResponse(customer);
  }

  private async setActive(
    id: string,
    isActive: boolean,
    userId: string,
  ): Promise<CustomerResponse> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(Customer);
      const customer = await repository.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!customer) {
        throw new NotFoundException('Customer not found');
      }
      customer.isActive = isActive;
      customer.updatedBy = userId;
      const saved = await repository.save(customer);
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
    repository: Repository<Customer>,
    code: string,
    currentId?: string,
  ): Promise<void> {
    const query = repository
      .createQueryBuilder('customer')
      .where('LOWER(customer.code) = LOWER(:code)', { code });
    if (currentId) {
      query.andWhere('customer.id <> :currentId', { currentId });
    }
    if (await query.getOne()) {
      throw new ConflictException('Customer code already exists');
    }
  }

  private toResponse(customer: Customer): CustomerResponse {
    return {
      id: customer.id,
      code: customer.code,
      nameTh: customer.nameTh,
      nameEn: customer.nameEn,
      taxId: customer.taxId,
      contactName: customer.contactName,
      telephone: customer.telephone,
      email: customer.email,
      address: customer.address,
      isActive: customer.isActive,
      createdBy: customer.createdBy,
      updatedBy: customer.updatedBy,
      createdAt: customer.createdAt,
      updatedAt: customer.updatedAt,
    };
  }
}
