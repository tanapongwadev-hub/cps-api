import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, In, QueryRunner } from 'typeorm';
import { Menu } from '../../entities/iam/menu.entity';
import { Permission } from '../../entities/iam/permission.entity';
import { Action } from '../../entities/iam/action.entity';
import {
  CreateMenuDto,
  CreateSubMenuDto,
  CreateMenuPermissionDto,
} from './dto/create-menu.dto';
import { UpdateMenuDto } from './dto/update-menu.dto';
import { DuplicateResourceException } from '../../common/exceptions/custom-exceptions';

@Injectable()
export class MenusService {
  constructor(
    @InjectRepository(Menu)
    private menuRepository: Repository<Menu>,
    @InjectRepository(Permission)
    private permissionRepository: Repository<Permission>,
    @InjectRepository(Action)
    private actionRepository: Repository<Action>,
    private dataSource: DataSource,
  ) {}

  async findAll(page: number = 1, limit: number = 20, search?: string) {
    const queryBuilder = this.menuRepository
      .createQueryBuilder('menu')
      .leftJoinAndSelect('menu.parent', 'parent')
      .select([
        'menu.id',
        'menu.code',
        'menu.nameTh',
        'menu.nameEn',
        'menu.menuType',
        'menu.path',
        'menu.icon',
        'menu.sortOrder',
        'menu.isVisible',
        'menu.isActive',
        'menu.createdAt',
        'parent.id',
        'parent.code',
        'parent.nameTh',
      ]);

    if (search) {
      queryBuilder.andWhere(
        '(menu.code ILIKE :search OR menu.nameTh ILIKE :search OR menu.nameEn ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    const [items, totalItems] = await queryBuilder
      .skip((page - 1) * limit)
      .take(limit)
      .orderBy('menu.sortOrder', 'ASC')
      .addOrderBy('menu.createdAt', 'DESC')
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

  async findTree() {
    const menus = await this.menuRepository
      .createQueryBuilder('menu')
      .leftJoinAndSelect('menu.parent', 'parent')
      .where('menu.isActive = :isActive', { isActive: true })
      .andWhere('menu.isVisible = :isVisible', { isVisible: true })
      .orderBy('menu.sortOrder', 'ASC')
      .addOrderBy('menu.createdAt', 'ASC')
      .getMany();

    // Build tree structure
    const menuMap = new Map();
    menus.forEach((menu) => menuMap.set(menu.id, { ...menu, children: [] }));

    const rootMenus: any[] = [];
    menus.forEach((menu) => {
      if (menu.parentId) {
        const parent = menuMap.get(menu.parentId);
        if (parent) {
          parent.children.push(menuMap.get(menu.id));
        }
      } else {
        rootMenus.push(menuMap.get(menu.id));
      }
    });

    return rootMenus;
  }

  async findOne(id: string) {
    const menu = await this.menuRepository.findOne({
      where: { id },
      relations: ['parent'],
    });
    if (!menu) {
      throw new NotFoundException('Menu not found');
    }

    const [children, permissions] = await Promise.all([
      this.menuRepository.find({
        where: { parentId: id },
        order: { sortOrder: 'ASC', createdAt: 'ASC' },
      }),
      this.permissionRepository.find({
        where: { menuId: id },
        relations: ['action'],
        order: { createdAt: 'ASC' },
      }),
    ]);

    return { ...menu, children, permissions };
  }

  async create(createMenuDto: CreateMenuDto) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const actions = await this.actionRepository.find();
      const actionMap = new Map(actions.map((action) => [action.code, action]));

      const allPermissions = [
        ...(createMenuDto.permissions ?? []),
        ...(createMenuDto.submenus?.flatMap((sub) => sub.permissions ?? []) ??
          []),
      ];
      for (const permission of allPermissions) {
        if (!actionMap.has(permission.action.toUpperCase())) {
          throw new BadRequestException(`Invalid action: ${permission.action}`);
        }
      }

      if (createMenuDto.parentId) {
        const parent = await queryRunner.manager.findOne(Menu, {
          where: { id: createMenuDto.parentId },
        });
        if (!parent) {
          throw new NotFoundException('Parent menu not found');
        }
      }

      const existingByCode = await queryRunner.manager.findOne(Menu, {
        where: { code: createMenuDto.code },
      });
      if (existingByCode) {
        throw new DuplicateResourceException('Menu code');
      }

      const subcodes = (createMenuDto.submenus ?? []).map((sub) => sub.code);
      if (new Set(subcodes).size !== subcodes.length) {
        throw new BadRequestException('Duplicate submenu code in request');
      }
      for (const code of subcodes) {
        const existing = await queryRunner.manager.findOne(Menu, {
          where: { code },
        });
        if (existing) {
          throw new DuplicateResourceException('Submenu code');
        }
      }

      const savedMain = await queryRunner.manager.save(
        Menu,
        this.buildMenuEntity(createMenuDto, createMenuDto.parentId),
      );

      const savedSubmenus: Menu[] = [];
      for (const subDto of createMenuDto.submenus ?? []) {
        const subMenu = this.buildMenuEntity(subDto, savedMain.id);
        const savedSub = await queryRunner.manager.save(Menu, subMenu);
        savedSubmenus.push(savedSub);

        await this.createPermissions(
          queryRunner,
          savedSub.id,
          subDto.permissions ?? [],
          actionMap,
        );
      }

      await this.createPermissions(
        queryRunner,
        savedMain.id,
        createMenuDto.permissions ?? [],
        actionMap,
      );

      await queryRunner.commitTransaction();

      const submenus = await this.menuRepository.find({
        where: { parentId: savedMain.id },
        order: { sortOrder: 'ASC', createdAt: 'ASC' },
      });

      const menuIds = [savedMain.id, ...submenus.map((sub) => sub.id)];
      const permissions = await this.permissionRepository.find({
        where: { menuId: In(menuIds) },
        relations: ['action'],
        order: { createdAt: 'ASC' },
      });

      const mapPermissions = (menuId: string) =>
        permissions
          .filter((permission) => permission.menuId === menuId)
          .map((permission) => ({
            id: permission.id,
            code: permission.code,
            description: permission.description,
            action: permission.action?.code ?? null,
          }));

      return {
        ...savedMain,
        permissions: mapPermissions(savedMain.id),
        submenus: submenus.map((sub) => ({
          ...sub,
          permissions: mapPermissions(sub.id),
        })),
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async update(id: string, updateMenuDto: UpdateMenuDto) {
    const menu = await this.findOne(id);

    if (updateMenuDto.parentId) {
      if (updateMenuDto.parentId === id) {
        throw new BadRequestException('Menu cannot be its own parent');
      }

      if (updateMenuDto.parentId !== menu.parentId) {
        const parent = await this.menuRepository.findOne({
          where: { id: updateMenuDto.parentId },
        });
        if (!parent) {
          throw new NotFoundException('Parent menu not found');
        }
      }
    }

    if (updateMenuDto.code !== undefined) menu.code = updateMenuDto.code;
    if (updateMenuDto.nameTh !== undefined) menu.nameTh = updateMenuDto.nameTh;
    if (updateMenuDto.nameEn !== undefined) menu.nameEn = updateMenuDto.nameEn;
    if (updateMenuDto.path !== undefined) menu.path = updateMenuDto.path;
    if (updateMenuDto.icon !== undefined) menu.icon = updateMenuDto.icon;
    if (updateMenuDto.sortOrder !== undefined)
      menu.sortOrder = updateMenuDto.sortOrder;
    if (updateMenuDto.isVisible !== undefined)
      menu.isVisible = updateMenuDto.isVisible;
    if (updateMenuDto.isActive !== undefined)
      menu.isActive = updateMenuDto.isActive;

    if (updateMenuDto.parentId !== undefined) {
      menu.parentId = (updateMenuDto.parentId || null) as string;
      menu.menuType = updateMenuDto.parentId
        ? 'SUB'
        : updateMenuDto.menuType !== undefined
          ? this.mapMenuType(updateMenuDto.menuType)
          : 'MAIN';
    } else if (updateMenuDto.menuType !== undefined) {
      menu.menuType = this.mapMenuType(updateMenuDto.menuType);
    }

    return this.menuRepository.save(menu);
  }

  async remove(id: string) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const menu = await this.findOne(id);

      // Check if menu has children
      const childCount = await this.menuRepository.count({
        where: { parentId: id },
      });

      if (childCount > 0) {
        throw new BadRequestException('Cannot delete menu with child menus');
      }

      // Delete all permissions associated with this menu
      await queryRunner.manager.delete(Permission, { menuId: id });

      // Delete the menu
      await queryRunner.manager.remove(Menu, menu);

      await queryRunner.commitTransaction();
      return { message: 'Menu and its permissions deleted successfully' };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private mapMenuType(menuType?: string): 'MAIN' | 'SUB' {
    return menuType === 'MAIN' ? 'MAIN' : 'SUB';
  }

  private buildMenuEntity(
    dto: CreateMenuDto | CreateSubMenuDto,
    parentId?: string,
  ): Partial<Menu> {
    const menu: Partial<Menu> = {
      code: dto.code,
      nameTh: dto.nameTh,
      nameEn: dto.nameEn,
      menuType: parentId ? 'SUB' : this.mapMenuType(dto.menuType),
      path: dto.path,
      sortOrder: dto.sortOrder ?? 0,
      icon: 'icon' in dto ? dto.icon : undefined,
      parentId: parentId || undefined,
    };

    return menu;
  }

  private async createPermissions(
    queryRunner: QueryRunner,
    menuId: string,
    permissions: CreateMenuPermissionDto[],
    actionMap: Map<string, Action>,
  ): Promise<void> {
    for (const permissionDto of permissions) {
      const actionCode = permissionDto.action.toUpperCase();
      const action = actionMap.get(actionCode);
      if (!action) {
        throw new BadRequestException(
          `Invalid action: ${permissionDto.action}`,
        );
      }

      const existingPermission = await queryRunner.manager.findOne(Permission, {
        where: { code: permissionDto.permissionCode },
      });
      if (existingPermission) {
        throw new DuplicateResourceException('Permission code');
      }

      const permission = queryRunner.manager.create(Permission, {
        menuId,
        actionId: action.id,
        code: permissionDto.permissionCode,
        description: permissionDto.permissionName,
      });
      await queryRunner.manager.save(Permission, permission);
    }
  }
}
