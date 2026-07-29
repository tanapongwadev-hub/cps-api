import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Permission } from '../../entities/iam/permission.entity';
import { Menu } from '../../entities/iam/menu.entity';
import { Action } from '../../entities/iam/action.entity';
import { Department } from '../../entities/iam/department.entity';
import { DepartmentPermission } from '../../entities/iam/department-permission.entity';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';
import { DuplicateResourceException } from '../../common/exceptions/custom-exceptions';

export interface DepartmentSummary {
  id: string;
  code: string;
  nameTh: string;
  nameEn: string;
}

@Injectable()
export class PermissionsService {
  constructor(
    @InjectRepository(Permission)
    private permissionRepository: Repository<Permission>,
    @InjectRepository(Menu)
    private menuRepository: Repository<Menu>,
    @InjectRepository(Action)
    private actionRepository: Repository<Action>,
    @InjectRepository(Department)
    private departmentRepository: Repository<Department>,
    @InjectRepository(DepartmentPermission)
    private departmentPermissionRepository: Repository<DepartmentPermission>,
    private dataSource: DataSource,
  ) {}

  async findAll(page: number = 1, limit: number = 20, search?: string) {
    const queryBuilder = this.permissionRepository
      .createQueryBuilder('permission')
      .leftJoinAndSelect('permission.menu', 'menu')
      .leftJoinAndSelect('permission.action', 'action')
      .select([
        'permission.id',
        'permission.code',
        'permission.isActive',
        'permission.createdAt',
        'menu.id',
        'menu.code',
        'menu.nameTh',
        'menu.nameEn',
        'action.id',
        'action.code',
        'action.nameTh',
        'action.nameEn',
      ]);

    if (search) {
      queryBuilder.andWhere(
        '(permission.code ILIKE :search OR menu.code ILIKE :search OR action.code ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    const [items, totalItems] = await queryBuilder
      .skip((page - 1) * limit)
      .take(limit)
      .orderBy('permission.createdAt', 'DESC')
      .getManyAndCount();

    const itemsWithDepartments = await this.attachDepartments(items);

    return {
      items: itemsWithDepartments,
      meta: {
        page,
        limit,
        totalItems,
        totalPages: Math.ceil(totalItems / limit),
      },
    };
  }

  async findOne(id: string) {
    const permission = await this.permissionRepository.findOne({
      where: { id },
      relations: ['menu', 'action'],
    });
    if (!permission) {
      throw new NotFoundException('Permission not found');
    }
    const [permissionWithDepartments] = await this.attachDepartments([
      permission,
    ]);
    return permissionWithDepartments;
  }

  private async attachDepartments(permissions: Permission[]) {
    if (permissions.length === 0) {
      return [] as Array<Permission & { departments: DepartmentSummary[] }>;
    }

    const mappings = await this.departmentPermissionRepository.find({
      where: {
        permissionId: In(permissions.map((permission) => permission.id)),
        isActive: true,
      },
      relations: ['department'],
    });
    const departmentsByPermission = new Map<string, DepartmentSummary[]>();

    for (const mapping of mappings) {
      if (!mapping.department) continue;
      const departments = departmentsByPermission.get(mapping.permissionId) ?? [];
      departments.push({
        id: mapping.department.id,
        code: mapping.department.code,
        nameTh: mapping.department.nameTh,
        nameEn: mapping.department.nameEn,
      });
      departmentsByPermission.set(mapping.permissionId, departments);
    }

    return permissions.map((permission) => ({
      ...permission,
      departments: (departmentsByPermission.get(permission.id) ?? []).sort(
        (a, b) => a.code.localeCompare(b.code),
      ),
    }));
  }

  async updateDepartments(id: string, departmentIds: string[]) {
    await this.dataSource.transaction(async (manager) => {
      const permissionRepository = manager.getRepository(Permission);
      const departmentRepository = manager.getRepository(Department);
      const departmentPermissionRepository =
        manager.getRepository(DepartmentPermission);
      const permission = await permissionRepository.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });

      if (!permission) {
        throw new NotFoundException('Permission not found');
      }

      if (departmentIds.length > 0) {
        const departments = await departmentRepository.find({
          where: { id: In(departmentIds) },
          select: ['id'],
        });
        const foundIds = new Set(
          departments.map((department) => department.id),
        );
        const missingIds = departmentIds.filter(
          (departmentId) => !foundIds.has(departmentId),
        );

        if (missingIds.length > 0) {
          throw new BadRequestException({
            message: 'Departments not found',
            departmentIds: missingIds,
          });
        }
      }

      const existingMappings = await departmentPermissionRepository.find({
        where: { permissionId: id },
      });
      const selectedIds = new Set(departmentIds);
      const existingByDepartment = new Map(
        existingMappings.map((mapping) => [mapping.departmentId, mapping]),
      );

      for (const mapping of existingMappings) {
        mapping.isActive = selectedIds.has(mapping.departmentId);
      }

      for (const departmentId of selectedIds) {
        if (existingByDepartment.has(departmentId)) continue;
        existingMappings.push(
          departmentPermissionRepository.create({
            permissionId: id,
            departmentId,
            isActive: true,
          }),
        );
      }

      if (existingMappings.length > 0) {
        await departmentPermissionRepository.save(existingMappings);
      }
    });

    return this.findOne(id);
  }

  /** รายการ menus + actions สำหรับ dropdown ในฟอร์มสร้าง/แก้ไข permission */
  async getOptions() {
    const [menus, actions] = await Promise.all([
      this.menuRepository.find({
        where: { isActive: true },
        order: { sortOrder: 'ASC', code: 'ASC' },
      }),
      this.actionRepository.find({
        where: { isActive: true },
        order: { sortOrder: 'ASC' },
      }),
    ]);

    return {
      menus: menus.map((m) => ({
        id: String(m.id),
        code: m.code,
        nameTh: m.nameTh,
        nameEn: m.nameEn,
      })),
      actions: actions.map((a) => ({
        id: String(a.id),
        code: a.code,
        nameTh: a.nameTh,
        nameEn: a.nameEn,
      })),
    };
  }

  private async assertRefsExist(menuId: string, actionId: string) {
    const [menu, action] = await Promise.all([
      this.menuRepository.findOne({ where: { id: menuId } }),
      this.actionRepository.findOne({ where: { id: actionId } }),
    ]);
    if (!menu) throw new NotFoundException('Menu not found');
    if (!action) throw new NotFoundException('Action not found');
  }

  async create(createPermissionDto: CreatePermissionDto) {
    const existing = await this.permissionRepository.findOne({
      where: { code: createPermissionDto.code },
    });
    if (existing) {
      throw new DuplicateResourceException('Permission code');
    }

    await this.assertRefsExist(createPermissionDto.menuId, createPermissionDto.actionId);

    const permission = this.permissionRepository.create(createPermissionDto);
    const saved = await this.permissionRepository.save(permission);
    return this.findOne(String(saved.id));
  }

  async update(id: string, updatePermissionDto: UpdatePermissionDto) {
    const permission = await this.permissionRepository.findOne({ where: { id } });
    if (!permission) {
      throw new NotFoundException('Permission not found');
    }

    if (updatePermissionDto.code && updatePermissionDto.code !== permission.code) {
      const existing = await this.permissionRepository.findOne({
        where: { code: updatePermissionDto.code },
      });
      if (existing) {
        throw new DuplicateResourceException('Permission code');
      }
    }

    const menuId = updatePermissionDto.menuId ?? permission.menuId;
    const actionId = updatePermissionDto.actionId ?? permission.actionId;
    await this.assertRefsExist(menuId, actionId);

    Object.assign(permission, updatePermissionDto);
    const saved = await this.permissionRepository.save(permission);
    return this.findOne(String(saved.id));
  }

  async remove(id: string) {
    const permission = await this.permissionRepository.findOne({ where: { id } });
    if (!permission) {
      throw new NotFoundException('Permission not found');
    }
    await this.permissionRepository.remove(permission);
    return { message: 'Permission deleted successfully' };
  }
}
