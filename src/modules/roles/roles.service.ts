import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Role } from '../../entities/iam/role.entity';
import { RoleAction } from '../../entities/iam/role-action.entity';
import { Action } from '../../entities/iam/action.entity';
import { UserDepartmentRole } from '../../entities/iam/user-department-role.entity';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { DuplicateResourceException } from '../../common/exceptions/custom-exceptions';

@Injectable()
export class RolesService {
  constructor(
    @InjectRepository(Role)
    private roleRepository: Repository<Role>,
    @InjectRepository(RoleAction)
    private roleActionRepository: Repository<RoleAction>,
    @InjectRepository(Action)
    private actionRepository: Repository<Action>,
    @InjectRepository(UserDepartmentRole)
    private userDepartmentRoleRepository: Repository<UserDepartmentRole>,
  ) {}

  /** ดึงจำนวนสิทธิ์ (role_actions ที่ active) และจำนวนผู้ใช้งานของแต่ละ role */
  private async getRoleCounts(roleIds: string[]) {
    if (roleIds.length === 0) {
      return {
        permissionCounts: new Map<string, number>(),
        userCounts: new Map<string, number>(),
      };
    }

    const permissionRows = await this.roleActionRepository
      .createQueryBuilder('ra')
      .select('ra.roleId', 'roleId')
      .addSelect('COUNT(*)', 'count')
      .where('ra.roleId IN (:...roleIds)', { roleIds })
      .andWhere('ra.isActive = true')
      .groupBy('ra.roleId')
      .getRawMany<{ roleId: string; count: string }>();

    const userRows = await this.userDepartmentRoleRepository
      .createQueryBuilder('udr')
      .select('udr.roleId', 'roleId')
      .addSelect('COUNT(DISTINCT udr.userId)', 'count')
      .where('udr.roleId IN (:...roleIds)', { roleIds })
      .andWhere('udr.isActive = true')
      .groupBy('udr.roleId')
      .getRawMany<{ roleId: string; count: string }>();

    return {
      permissionCounts: new Map(
        permissionRows.map((r) => [String(r.roleId), Number(r.count)]),
      ),
      userCounts: new Map(
        userRows.map((r) => [String(r.roleId), Number(r.count)]),
      ),
    };
  }

  /** ดึง action codes ที่ role นี้มี (จาก role_actions) */
  private async getRoleActionCodes(roleId: string): Promise<string[]> {
    const roleActions = await this.roleActionRepository.find({
      where: { roleId, isActive: true },
      relations: ['action'],
    });
    return roleActions.map((ra) => ra.action?.code).filter(Boolean);
  }

  /** ดึง action codes ของหลาย role พร้อมกัน (query เดียว) */
  private async getRoleActionCodesMap(
    roleIds: string[],
  ): Promise<Map<string, string[]>> {
    const map = new Map<string, string[]>();
    if (roleIds.length === 0) return map;

    const roleActions = await this.roleActionRepository.find({
      where: { roleId: In(roleIds), isActive: true },
      relations: ['action'],
    });
    for (const ra of roleActions) {
      const key = String(ra.roleId);
      if (!map.has(key)) map.set(key, []);
      if (ra.action?.code) map.get(key)!.push(ra.action.code);
    }
    return map;
  }

  /** sync role_actions ตาม action codes ที่ส่งมา (ปิดตัวที่ไม่เลือก, เพิ่ม/เปิดตัวที่เลือก) */
  private async syncRoleActions(roleId: string, actionCodes: string[]) {
    const actions = await this.actionRepository.find({
      where: { code: In(actionCodes.map((c) => c.toUpperCase())) },
    });
    const wantedActionIds = new Set(actions.map((a) => String(a.id)));

    const existing = await this.roleActionRepository.find({
      where: { roleId },
    });
    for (const ra of existing) {
      const shouldBeActive = wantedActionIds.has(String(ra.actionId));
      if (ra.isActive !== shouldBeActive) {
        ra.isActive = shouldBeActive;
        await this.roleActionRepository.save(ra);
      }
      wantedActionIds.delete(String(ra.actionId));
    }

    for (const actionId of wantedActionIds) {
      await this.roleActionRepository.save(
        this.roleActionRepository.create({ roleId, actionId, isActive: true }),
      );
    }
  }

  async findAll(
    page: number = 1,
    limit: number = 20,
    search?: string,
    status?: string,
  ) {
    const queryBuilder = this.roleRepository
      .createQueryBuilder('role')
      .select([
        'role.id',
        'role.code',
        'role.nameTh',
        'role.nameEn',
        'role.scopeType',
        'role.isActive',
        'role.isSystem',
        'role.description',
        'role.createdAt',
        'role.updatedAt',
      ]);

    if (search) {
      queryBuilder.andWhere(
        '(role.code ILIKE :search OR role.nameTh ILIKE :search OR role.nameEn ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (status === 'active') {
      queryBuilder.andWhere('role.isActive = true');
    } else if (status === 'inactive') {
      queryBuilder.andWhere('role.isActive = false');
    }

    const [items, totalItems] = await queryBuilder
      .skip((page - 1) * limit)
      .take(limit)
      .orderBy('role.createdAt', 'DESC')
      .getManyAndCount();

    const roleIds = items.map((r) => String(r.id));
    const { permissionCounts, userCounts } = await this.getRoleCounts(roleIds);
    const actionCodesMap = await this.getRoleActionCodesMap(roleIds);

    return {
      items: items.map((r) => ({
        ...r,
        actionCodes: actionCodesMap.get(String(r.id)) ?? [],
        permissionCount: permissionCounts.get(String(r.id)) ?? 0,
        userCount: userCounts.get(String(r.id)) ?? 0,
      })),
      meta: {
        page,
        limit,
        totalItems,
        totalPages: Math.ceil(totalItems / limit),
      },
    };
  }

  async findOne(id: string) {
    const role = await this.roleRepository.findOne({ where: { id } });
    if (!role) {
      throw new NotFoundException('Role not found');
    }

    const { userCounts } = await this.getRoleCounts([String(role.id)]);
    const actionCodes = await this.getRoleActionCodes(String(role.id));

    return {
      ...role,
      actionCodes,
      permissionCount: actionCodes.length,
      userCount: userCounts.get(String(role.id)) ?? 0,
    };
  }

  async create(createRoleDto: CreateRoleDto) {
    const existing = await this.roleRepository.findOne({
      where: { code: createRoleDto.code },
    });

    if (existing) {
      throw new DuplicateResourceException('Role code');
    }

    const { actionCodes, ...roleData } = createRoleDto;
    const role = await this.roleRepository.save(
      this.roleRepository.create(roleData),
    );

    if (actionCodes?.length) {
      await this.syncRoleActions(String(role.id), actionCodes);
    }

    return this.findOne(String(role.id));
  }

  async update(id: string, updateRoleDto: UpdateRoleDto) {
    const role = await this.findOne(id);

    if (updateRoleDto.code && updateRoleDto.code !== role.code) {
      const existing = await this.roleRepository.findOne({
        where: { code: updateRoleDto.code },
      });
      if (existing) {
        throw new DuplicateResourceException('Role code');
      }
    }

    const { actionCodes, ...roleData } = updateRoleDto;
    Object.assign(role, roleData);
    const saved = await this.roleRepository.save(role);

    if (actionCodes) {
      await this.syncRoleActions(String(saved.id), actionCodes);
    }

    return this.findOne(String(saved.id));
  }

  async remove(id: string) {
    const role = await this.findOne(id);

    // Endpoint นี้ถูก guard ให้เฉพาะ SUPER_ADMIN อยู่แล้ว — อนุญาตลบได้ทุก role (full access)
    await this.roleRepository.remove(role);
    return { message: 'Role deleted successfully' };
  }
}
