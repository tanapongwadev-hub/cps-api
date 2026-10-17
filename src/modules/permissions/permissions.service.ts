import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import {
  Permission,
  PermissionAccessScope,
} from '../../entities/iam/permission.entity';
import { Menu } from '../../entities/iam/menu.entity';
import { Action } from '../../entities/iam/action.entity';
import { Department } from '../../entities/iam/department.entity';
import { DepartmentPermission } from '../../entities/iam/department-permission.entity';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';
import { UpdatePermissionAccessDto } from './dto/update-permission-access.dto';
import { DuplicateResourceException } from '../../common/exceptions/custom-exceptions';
import { createTraceId, recordAuditEvent } from '../../common/stock-ledger';
import {
  computePermissionAccessVersion,
  findReadDependencyViolations,
  PermissionAccessState,
} from './permission-access-matrix';

/** Serializes every change to permission department scopes. */
const PERMISSION_ACCESS_LOCK_KEY = 'iam.permission_access';

export interface PermissionMatrix {
  version: string;
  actions: { id: string; code: string; nameTh: string; nameEn: string; sortOrder: number }[];
  departments: { id: string; code: string; nameTh: string; nameEn: string; parentId: string | null; isActive: boolean }[];
  menus: {
    id: string;
    parentId: string | null;
    code: string;
    nameTh: string;
    nameEn: string;
    menuType: Menu['menuType'];
    path: string | null;
    icon: string | null;
    sortOrder: number;
    isActive: boolean;
    isVisible: boolean;
  }[];
  permissions: {
    id: string;
    code: string;
    description: string | null;
    menuId: string;
    actionId: string;
    actionCode: string;
    isActive: boolean;
    accessScope: PermissionAccessScope;
    departmentIds: string[];
  }[];
}

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
      const departments =
        departmentsByPermission.get(mapping.permissionId) ?? [];
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

  /**
   * Single-permission department list (legacy endpoint). Always stores the
   * DEPARTMENTS scope, so an empty list closes the permission to everybody
   * instead of silently reopening it to every department.
   */
  async updateDepartments(
    id: string,
    departmentIds: string[],
    userId: string | null = null,
  ) {
    await this.dataSource.transaction(async (manager) => {
      await this.lockPermissionAccess(manager);
      const permission = await manager.getRepository(Permission).findOne({
        where: { id },
      });

      if (!permission) {
        throw new NotFoundException('Permission not found');
      }

      await this.assertDepartmentsExist(manager, departmentIds, false);
      const before = await this.loadAccessState(manager, [id]);
      await this.writeAccess(manager, id, 'DEPARTMENTS', departmentIds);
      await this.auditAccessChange(manager, before[0], 'DEPARTMENTS', departmentIds, userId);
    });

    return this.findOne(id);
  }

  /** Everything the permission management screen needs, plus a version. */
  async getMatrix(
    manager: EntityManager = this.dataSource.manager,
  ): Promise<PermissionMatrix> {
    const [actions, departments, menus, permissions, mappings] =
      await Promise.all([
        manager.getRepository(Action).find({ order: { sortOrder: 'ASC' } }),
        manager.getRepository(Department).find({ order: { code: 'ASC' } }),
        manager
          .getRepository(Menu)
          .find({ order: { sortOrder: 'ASC', id: 'ASC' } }),
        manager.getRepository(Permission).find({ order: { id: 'ASC' } }),
        manager
          .getRepository(DepartmentPermission)
          .find({ where: { isActive: true } }),
      ]);
    const actionCodeById = new Map(actions.map((a) => [a.id, a.code]));
    const departmentIdsByPermission = this.groupDepartmentIds(mappings);

    const permissionRows = permissions.map((permission) => ({
      id: permission.id,
      code: permission.code,
      description: permission.description ?? null,
      menuId: permission.menuId,
      actionId: permission.actionId,
      actionCode: actionCodeById.get(permission.actionId) ?? '',
      isActive: permission.isActive,
      accessScope: permission.accessScope ?? 'ALL',
      departmentIds:
        (permission.accessScope ?? 'ALL') === 'DEPARTMENTS'
          ? (departmentIdsByPermission.get(permission.id) ?? [])
          : [],
    }));

    return {
      version: computePermissionAccessVersion(permissionRows),
      actions: actions
        .filter((action) => action.isActive)
        .map((action) => ({
          id: action.id,
          code: action.code,
          nameTh: action.nameTh,
          nameEn: action.nameEn,
          sortOrder: action.sortOrder,
        })),
      departments: departments.map((department) => ({
        id: department.id,
        code: department.code,
        nameTh: department.nameTh,
        nameEn: department.nameEn,
        parentId: department.parentId ?? null,
        isActive: department.isActive,
      })),
      menus: menus.map((menu) => ({
        id: menu.id,
        parentId: menu.parentId ?? null,
        code: menu.code,
        nameTh: menu.nameTh,
        nameEn: menu.nameEn,
        menuType: menu.menuType,
        path: menu.path ?? null,
        icon: menu.icon ?? null,
        sortOrder: menu.sortOrder,
        isActive: menu.isActive,
        isVisible: menu.isVisible,
      })),
      permissions: permissionRows,
    };
  }

  /**
   * Bulk save of department scopes from the permission matrix. Runs under one
   * advisory lock, rejects a stale `version` with 409, keeps the READ
   * dependency for every touched menu, and audits each changed permission.
   */
  async updateAccess(
    dto: UpdatePermissionAccessDto,
    userId: string | null,
  ): Promise<PermissionMatrix> {
    const reason = dto.reason?.trim();
    if (!reason) {
      throw new BadRequestException('กรุณาระบุเหตุผลในการเปลี่ยนสิทธิ์');
    }

    return this.dataSource.transaction(async (manager) => {
      await this.lockPermissionAccess(manager);

      const current = await this.loadAccessState(manager);
      if (computePermissionAccessVersion(current) !== dto.version) {
        throw new ConflictException(
          'สิทธิ์ถูกแก้ไขจากที่อื่นแล้ว กรุณาโหลดข้อมูลใหม่ก่อนบันทึก',
        );
      }

      const seen = new Set<string>();
      for (const item of dto.items) {
        if (seen.has(item.permissionId)) {
          throw new BadRequestException({
            message: 'มีสิทธิ์ซ้ำในรายการที่บันทึก',
            permissionId: item.permissionId,
          });
        }
        seen.add(item.permissionId);
        if (item.accessScope === 'ALL' && item.departmentIds.length > 0) {
          throw new BadRequestException({
            message: 'สิทธิ์ที่เปิดทุกแผนกต้องไม่ระบุรายการแผนก',
            permissionId: item.permissionId,
          });
        }
      }

      const byId = new Map(current.map((state) => [state.id, state]));
      const missing = dto.items
        .map((item) => item.permissionId)
        .filter((permissionId) => !byId.has(permissionId));
      if (missing.length > 0) {
        throw new BadRequestException({
          message: 'ไม่พบสิทธิ์ที่ระบุ',
          permissionIds: missing,
        });
      }
      await this.assertDepartmentsExist(
        manager,
        [...new Set(dto.items.flatMap((item) => item.departmentIds))],
        true,
      );

      const changed = dto.items.filter((item) => {
        const state = byId.get(item.permissionId)!;
        return (
          state.accessScope !== item.accessScope ||
          !this.sameIds(state.departmentIds, item.departmentIds)
        );
      });

      const next = current.map((state) => {
        const item = changed.find((entry) => entry.permissionId === state.id);
        return item
          ? {
              ...state,
              accessScope: item.accessScope,
              departmentIds: [...item.departmentIds],
            }
          : state;
      });
      const activeDepartments = await manager
        .getRepository(Department)
        .find({ where: { isActive: true }, select: ['id', 'code'] });
      const violations = findReadDependencyViolations(
        next,
        changed.map((item) => byId.get(item.permissionId)!.menuId),
        activeDepartments.map((department) => department.id),
      );
      if (violations.length > 0) {
        const departmentCode = new Map(
          activeDepartments.map((department) => [department.id, department.code]),
        );
        throw new BadRequestException({
          message:
            'แผนกที่ได้สิทธิ์อื่นของเมนูต้องได้สิทธิ์ "ดู" ของเมนูนั้นด้วย',
          violations: violations.map((violation) => ({
            ...violation,
            departmentCode: departmentCode.get(violation.departmentId) ?? null,
          })),
        });
      }

      for (const item of changed) {
        await this.writeAccess(
          manager,
          item.permissionId,
          item.accessScope,
          item.departmentIds,
        );
        await this.auditAccessChange(
          manager,
          byId.get(item.permissionId)!,
          item.accessScope,
          item.departmentIds,
          userId,
          reason,
        );
      }

      return this.getMatrix(manager);
    });
  }

  private async lockPermissionAccess(manager: EntityManager) {
    await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      PERMISSION_ACCESS_LOCK_KEY,
    ]);
  }

  private groupDepartmentIds(mappings: DepartmentPermission[]) {
    const byPermission = new Map<string, string[]>();
    for (const mapping of mappings) {
      const ids = byPermission.get(mapping.permissionId) ?? [];
      ids.push(mapping.departmentId);
      byPermission.set(mapping.permissionId, ids);
    }
    for (const ids of byPermission.values()) {
      ids.sort((a, b) => Number(a) - Number(b));
    }
    return byPermission;
  }

  private async loadAccessState(
    manager: EntityManager,
    permissionIds?: string[],
  ): Promise<PermissionAccessState[]> {
    const permissions = await manager.getRepository(Permission).find({
      where: permissionIds ? { id: In(permissionIds) } : {},
      relations: ['action'],
    });
    const mappings = await manager.getRepository(DepartmentPermission).find({
      where: permissionIds
        ? { permissionId: In(permissionIds), isActive: true }
        : { isActive: true },
    });
    const departmentIdsByPermission = this.groupDepartmentIds(mappings);
    return permissions.map((permission) => {
      const accessScope = permission.accessScope ?? 'ALL';
      return {
        id: permission.id,
        code: permission.code,
        menuId: permission.menuId,
        actionCode: permission.action?.code ?? '',
        isActive: permission.isActive,
        accessScope,
        departmentIds:
          accessScope === 'DEPARTMENTS'
            ? (departmentIdsByPermission.get(permission.id) ?? [])
            : [],
      };
    });
  }

  private async assertDepartmentsExist(
    manager: EntityManager,
    departmentIds: string[],
    requireActive: boolean,
  ) {
    if (departmentIds.length === 0) return;
    const departments = await manager.getRepository(Department).find({
      where: { id: In(departmentIds) },
      select: ['id', 'isActive'],
    });
    const usable = new Set(
      departments
        .filter((department) => !requireActive || department.isActive)
        .map((department) => department.id),
    );
    const missingIds = departmentIds.filter((id) => !usable.has(id));
    if (missingIds.length > 0) {
      throw new BadRequestException({
        message: requireActive
          ? 'ไม่พบแผนกหรือแผนกถูกปิดใช้งาน'
          : 'Departments not found',
        departmentIds: missingIds,
      });
    }
  }

  /** Stores the scope and soft-toggles department mappings to match it. */
  private async writeAccess(
    manager: EntityManager,
    permissionId: string,
    accessScope: PermissionAccessScope,
    departmentIds: string[],
  ) {
    await manager
      .getRepository(Permission)
      .update({ id: permissionId }, { accessScope });

    const departmentPermissionRepository =
      manager.getRepository(DepartmentPermission);
    const existingMappings = await departmentPermissionRepository.find({
      where: { permissionId },
    });
    const selectedIds = new Set(
      accessScope === 'DEPARTMENTS' ? departmentIds : [],
    );
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
          permissionId,
          departmentId,
          isActive: true,
        }),
      );
    }

    if (existingMappings.length > 0) {
      await departmentPermissionRepository.save(existingMappings);
    }
  }

  private async auditAccessChange(
    manager: EntityManager,
    before: PermissionAccessState | undefined,
    accessScope: PermissionAccessScope,
    departmentIds: string[],
    userId: string | null,
    reason: string | null = null,
  ) {
    if (!before) return;
    await recordAuditEvent(manager, {
      traceId: createTraceId(),
      action: 'UPDATE',
      eventName: 'iam.permission.department_scope_changed',
      targetType: 'PERMISSION',
      targetId: before.id,
      performedBy: userId,
      reason,
      before: {
        code: before.code,
        accessScope: before.accessScope,
        departmentIds: before.departmentIds,
      },
      after: {
        code: before.code,
        accessScope,
        departmentIds:
          accessScope === 'DEPARTMENTS'
            ? [...departmentIds].sort((a, b) => Number(a) - Number(b))
            : [],
      },
    });
  }

  private sameIds(a: readonly string[], b: readonly string[]) {
    if (a.length !== b.length) return false;
    const set = new Set(a);
    return b.every((id) => set.has(id));
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

    await this.assertRefsExist(
      createPermissionDto.menuId,
      createPermissionDto.actionId,
    );

    const permission = this.permissionRepository.create(createPermissionDto);
    const saved = await this.permissionRepository.save(permission);
    return this.findOne(String(saved.id));
  }

  async update(id: string, updatePermissionDto: UpdatePermissionDto) {
    const permission = await this.permissionRepository.findOne({
      where: { id },
    });
    if (!permission) {
      throw new NotFoundException('Permission not found');
    }

    if (
      updatePermissionDto.code &&
      updatePermissionDto.code !== permission.code
    ) {
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
    const permission = await this.permissionRepository.findOne({
      where: { id },
    });
    if (!permission) {
      throw new NotFoundException('Permission not found');
    }
    await this.permissionRepository.remove(permission);
    return { message: 'Permission deleted successfully' };
  }
}
