import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, SelectQueryBuilder } from 'typeorm';
import {
  Organization,
  OrganizationType,
} from '../../entities/master/organization.entity';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import {
  ListOrganizationsQueryDto,
  OrganizationSortBy,
} from './dto/list-organizations-query.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';

const ORG_SORT_COLUMNS: Record<OrganizationSortBy, string> = {
  code: 'org.code',
  nameTh: 'org.name_th',
  type: 'org.type',
  isActive: 'org.is_active',
  createdAt: 'org.created_at',
  updatedAt: 'org.updated_at',
};

export type OrganizationResponse = {
  id: string;
  code: string;
  nameTh: string;
  nameEn: string | null;
  taxId: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  logoUrl: string | null;
  parentId: string | null;
  type: OrganizationType;
  isActive: boolean;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectRepository(Organization)
    private readonly repo: Repository<Organization>,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateOrganizationDto, userId: string) {
    return this.dataSource.transaction(async (manager) => {
      const r = manager.getRepository(Organization);
      const code = this.normalize(dto.code);
      await this.assertCodeAvailable(r, code);
      if (dto.parentId) await this.assertActiveParent(r, dto.parentId);
      const saved = await r.save(
        r.create({
          code,
          nameTh: dto.nameTh.trim(),
          nameEn: this.toNullable(dto.nameEn),
          taxId: this.toNullable(dto.taxId),
          address: this.toNullable(dto.address),
          phone: this.toNullable(dto.phone),
          email: this.toNullable(dto.email),
          website: this.toNullable(dto.website),
          logoUrl: this.toNullable(dto.logoUrl),
          parentId: this.toNullable(dto.parentId),
          type: dto.type,
          isActive: dto.isActive ?? true,
          createdBy: userId,
          updatedBy: userId,
        }),
      );
      return this.toResponse(saved);
    });
  }

  async update(id: string, dto: UpdateOrganizationDto, userId: string) {
    return this.dataSource.transaction(async (manager) => {
      const r = manager.getRepository(Organization);
      const o = await r.findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!o) throw new NotFoundException('Organization not found');
      if (new Date(dto.updatedAt).getTime() !== new Date(o.updatedAt).getTime()) {
        throw new ConflictException('Organization has been updated');
      }
      const code = dto.code ? this.normalize(dto.code) : o.code;
      if (dto.code) await this.assertCodeAvailable(r, code, o.id);
      if (dto.parentId !== undefined) {
        if (dto.parentId && dto.parentId === id) {
          throw new ConflictException('Organization cannot be its own parent');
        }
        if (dto.parentId) await this.assertActiveParent(r, dto.parentId);
      }
      if (dto.code !== undefined) o.code = code;
      if (dto.nameTh !== undefined) o.nameTh = dto.nameTh.trim();
      if (dto.nameEn !== undefined) o.nameEn = this.toNullable(dto.nameEn);
      if (dto.taxId !== undefined) o.taxId = this.toNullable(dto.taxId);
      if (dto.address !== undefined) o.address = this.toNullable(dto.address);
      if (dto.phone !== undefined) o.phone = this.toNullable(dto.phone);
      if (dto.email !== undefined) o.email = this.toNullable(dto.email);
      if (dto.website !== undefined) o.website = this.toNullable(dto.website);
      if (dto.logoUrl !== undefined) o.logoUrl = this.toNullable(dto.logoUrl);
      if (dto.parentId !== undefined) o.parentId = this.toNullable(dto.parentId);
      if (dto.type !== undefined) o.type = dto.type;
      if (dto.isActive !== undefined) o.isActive = dto.isActive;
      o.updatedBy = userId;
      const saved = await r.save(o);
      return this.toResponse(saved);
    });
  }

  async deactivate(id: string, userId: string) { return this.setActive(id, false, userId); }
  async restore(id: string, userId: string) { return this.setActive(id, true, userId); }

  async findAll(query: ListOrganizationsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const qb: SelectQueryBuilder<Organization> = this.repo.createQueryBuilder('org');
    if (query.search) {
      qb.andWhere('(org.code ILIKE :s OR org.name_th ILIKE :s OR org.name_en ILIKE :s OR org.tax_id ILIKE :s)', { s: `%${query.search}%` });
    }
    if (query.isActive !== undefined) qb.andWhere('org.is_active = :a', { a: query.isActive });
    if (query.type) qb.andWhere('org.type = :t', { t: query.type });
    const sortColumn = ORG_SORT_COLUMNS[query.sortBy] ?? ORG_SORT_COLUMNS.code;
    const sortOrder = query.sortOrder === 'desc' ? 'DESC' : 'ASC';
    const [rows, total] = await qb
      .orderBy(sortColumn, sortOrder)
      .addOrderBy('org.id', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
    return {
      items: rows.map((r) => this.toResponse(r)),
      meta: { page, limit, totalItems: total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string) {
    const o = await this.repo.findOne({ where: { id } });
    if (!o) throw new NotFoundException('Organization not found');
    return this.toResponse(o);
  }

  private async setActive(id: string, isActive: boolean, userId: string) {
    return this.dataSource.transaction(async (manager) => {
      const r = manager.getRepository(Organization);
      const o = await r.findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!o) throw new NotFoundException('Organization not found');
      o.isActive = isActive;
      o.updatedBy = userId;
      const saved = await r.save(o);
      return this.toResponse(saved);
    });
  }

  private normalize(c: string) { return c.trim().toUpperCase(); }
  private toNullable(v: string | null | undefined) {
    if (v === null || v === undefined) return null;
    const t = v.trim();
    return t === '' ? null : t;
  }
  private async assertCodeAvailable(r: Repository<Organization>, code: string, currentId?: string) {
    const q = r.createQueryBuilder('o').where('LOWER(o.code) = LOWER(:c)', { c: code });
    if (currentId) q.andWhere('o.id <> :id', { id: currentId });
    if (await q.getOne()) throw new ConflictException('Organization code already exists');
  }
  private async assertActiveParent(r: Repository<Organization>, id: string) {
    const p = await r.findOne({ where: { id, isActive: true } });
    if (!p) throw new NotFoundException('Parent organization not found');
  }
  private toResponse(o: Organization): OrganizationResponse {
    return {
      id: o.id, code: o.code, nameTh: o.nameTh, nameEn: o.nameEn,
      taxId: o.taxId, address: o.address, phone: o.phone, email: o.email,
      website: o.website, logoUrl: o.logoUrl, parentId: o.parentId,
      type: o.type, isActive: o.isActive,
      createdBy: o.createdBy, updatedBy: o.updatedBy,
      createdAt: o.createdAt, updatedAt: o.updatedAt,
    };
  }
}
