import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Permission } from '../../entities/iam/permission.entity';
import { Menu } from '../../entities/iam/menu.entity';
import { Action } from '../../entities/iam/action.entity';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';
import { DuplicateResourceException } from '../../common/exceptions/custom-exceptions';

@Injectable()
export class PermissionsService {
  constructor(
    @InjectRepository(Permission)
    private permissionRepository: Repository<Permission>,
    @InjectRepository(Menu)
    private menuRepository: Repository<Menu>,
    @InjectRepository(Action)
    private actionRepository: Repository<Action>,
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

    return {
      items,
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
    return permission;
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
