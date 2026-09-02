import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { MenusService } from './menus.service';
import { Menu } from '../../entities/iam/menu.entity';
import { Permission } from '../../entities/iam/permission.entity';
import { Action } from '../../entities/iam/action.entity';
import { computeMenuTreeVersion } from './menu-tree-ordering';

function menu(overrides: Partial<Menu>): Menu {
  return {
    id: '1',
    parentId: null,
    code: 'ROOT',
    nameTh: 'เมนูหลัก',
    nameEn: 'Root',
    menuType: 'MAIN',
    path: '/root',
    icon: 'layout-dashboard',
    sortOrder: 0,
    isVisible: true,
    isActive: true,
    createdBy: '1',
    updatedBy: '1',
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    updatedAt: new Date('2026-09-01T00:00:00.000Z'),
    parent: null,
    ...overrides,
  };
}

describe('MenusService', () => {
  let service: MenusService;
  let menuRepository: jest.Mocked<Repository<Menu>>;
  let permissionRepository: jest.Mocked<Repository<Permission>>;
  let lockedQueryBuilder: {
    setLock: jest.Mock;
    getMany: jest.Mock;
  };
  let transactionMenuRepository: {
    createQueryBuilder: jest.Mock;
  };
  let mockQueryRunner: {
    connect: jest.Mock;
    startTransaction: jest.Mock;
    commitTransaction: jest.Mock;
    rollbackTransaction: jest.Mock;
    release: jest.Mock;
    manager: {
      delete: jest.Mock;
      remove: jest.Mock;
      getRepository: jest.Mock;
      save: jest.Mock;
    };
  };

  beforeEach(() => {
    menuRepository = {
      findOne: jest.fn(),
      find: jest.fn(),
      count: jest.fn(),
      save: jest.fn(),
      remove: jest.fn(),
    } as unknown as jest.Mocked<Repository<Menu>>;
    permissionRepository = {
      find: jest.fn(),
      count: jest.fn(),
    } as unknown as jest.Mocked<Repository<Permission>>;

    lockedQueryBuilder = {
      setLock: jest.fn().mockReturnThis(),
      getMany: jest.fn(),
    };
    transactionMenuRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(lockedQueryBuilder),
    };
    mockQueryRunner = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      manager: {
        delete: jest.fn().mockResolvedValue(undefined),
        remove: jest.fn().mockResolvedValue(undefined),
        getRepository: jest.fn().mockReturnValue(transactionMenuRepository),
        save: jest.fn(),
      },
    };

    const mockDataSource = {
      createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
    } as unknown as DataSource;

    service = new MenusService(
      menuRepository,
      permissionRepository,
      {} as jest.Mocked<Repository<Action>>,
      mockDataSource,
    );
  });

  it('returns every menu in the management tree, including hidden and inactive nodes', async () => {
    const records = [
      menu({ id: '1' }),
      menu({
        id: '2',
        parentId: '1',
        code: 'HIDDEN',
        nameEn: 'Hidden',
        menuType: 'SUB',
        path: '/hidden',
        isVisible: false,
      }),
      menu({
        id: '3',
        code: 'INACTIVE',
        nameEn: 'Inactive',
        path: '/inactive',
        sortOrder: 1,
        isActive: false,
      }),
    ];
    menuRepository.find.mockResolvedValue(records);

    const result = await service.findManagementTree();

    expect(result.version).toMatch(/^sha256:/);
    expect(result.menus).toMatchObject([
      {
        id: '1',
        children: [{ id: '2', isVisible: false }],
      },
      { id: '3', isActive: false },
    ]);
    expect(menuRepository.find.mock.calls).toEqual([[]]);
  });

  it('locks the complete menu set, saves only changed rows, and commits a reorder', async () => {
    const records = [
      menu({ id: '1', code: 'FIRST', nameEn: 'First' }),
      menu({
        id: '2',
        code: 'SECOND',
        nameEn: 'Second',
        path: '/second',
        sortOrder: 1,
      }),
      menu({
        id: '3',
        parentId: '1',
        code: 'CHILD',
        nameEn: 'Child',
        path: '/child',
        menuType: 'SUB',
      }),
    ];
    lockedQueryBuilder.getMany.mockResolvedValue(records);
    let savedInput: Menu[] = [];
    mockQueryRunner.manager.save.mockImplementation(
      (_entity: typeof Menu, changed: Menu[]) => {
        savedInput = changed;
        return Promise.resolve(
          changed.map((record) => ({
            ...record,
            updatedAt: new Date('2026-09-02T00:00:00.000Z'),
          })),
        );
      },
    );

    const result = await service.reorder({
      version: computeMenuTreeVersion(records),
      items: [
        { id: '2', parentId: null, sortOrder: 0 },
        { id: '1', parentId: null, sortOrder: 1 },
        { id: '3', parentId: '1', sortOrder: 0 },
      ],
    });

    expect(mockQueryRunner.connect).toHaveBeenCalledTimes(1);
    expect(mockQueryRunner.startTransaction).toHaveBeenCalledTimes(1);
    expect(
      mockQueryRunner.startTransaction.mock.invocationCallOrder[0],
    ).toBeLessThan(lockedQueryBuilder.getMany.mock.invocationCallOrder[0]);
    expect(mockQueryRunner.manager.getRepository).toHaveBeenCalledWith(Menu);
    expect(transactionMenuRepository.createQueryBuilder).toHaveBeenCalledWith(
      'menu',
    );
    expect(lockedQueryBuilder.setLock).toHaveBeenCalledWith(
      'pessimistic_write',
    );
    expect(mockQueryRunner.manager.save).toHaveBeenCalledWith(
      Menu,
      expect.arrayContaining([
        expect.objectContaining({ id: '1', sortOrder: 1 }),
        expect.objectContaining({ id: '2', sortOrder: 0 }),
      ]),
    );
    expect(savedInput).toHaveLength(2);
    expect(result).toEqual({
      version:
        'sha256:b03c9aa954d501a8e19ce645ccb7bc9be94f37cd678c739603690d00674d19ee',
      updatedCount: 2,
    });
    expect(result.version).not.toBe(computeMenuTreeVersion(records));
    expect(mockQueryRunner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(mockQueryRunner.rollbackTransaction).not.toHaveBeenCalled();
    expect(mockQueryRunner.release).toHaveBeenCalledTimes(1);
  });

  it('rolls back a stale reorder without writing', async () => {
    const records = [menu({ id: '1' })];
    lockedQueryBuilder.getMany.mockResolvedValue(records);

    await expect(
      service.reorder({
        version: 'sha256:stale',
        items: [{ id: '1', parentId: null, sortOrder: 0 }],
      }),
    ).rejects.toThrow(ConflictException);

    expect(mockQueryRunner.manager.save).not.toHaveBeenCalled();
    expect(mockQueryRunner.commitTransaction).not.toHaveBeenCalled();
    expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(mockQueryRunner.release).toHaveBeenCalledTimes(1);
  });

  it('rolls back an invalid complete-layout request without writing', async () => {
    const records = [menu({ id: '1' }), menu({ id: '2', sortOrder: 1 })];
    lockedQueryBuilder.getMany.mockResolvedValue(records);

    await expect(
      service.reorder({
        version: computeMenuTreeVersion(records),
        items: [{ id: '1', parentId: null, sortOrder: 0 }],
      }),
    ).rejects.toThrow(BadRequestException);

    expect(mockQueryRunner.manager.save).not.toHaveBeenCalled();
    expect(mockQueryRunner.commitTransaction).not.toHaveBeenCalled();
    expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(mockQueryRunner.release).toHaveBeenCalledTimes(1);
  });

  it('rolls back when saving reordered menus fails', async () => {
    const records = [
      menu({ id: '1' }),
      menu({ id: '2', sortOrder: 1, code: 'SECOND', nameEn: 'Second' }),
    ];
    lockedQueryBuilder.getMany.mockResolvedValue(records);
    mockQueryRunner.manager.save.mockRejectedValue(new Error('write failed'));

    await expect(
      service.reorder({
        version: computeMenuTreeVersion(records),
        items: [
          { id: '2', parentId: null, sortOrder: 0 },
          { id: '1', parentId: null, sortOrder: 1 },
        ],
      }),
    ).rejects.toThrow('write failed');

    expect(mockQueryRunner.commitTransaction).not.toHaveBeenCalled();
    expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(mockQueryRunner.release).toHaveBeenCalledTimes(1);
  });

  it('returns a menu with its children and permissions', async () => {
    const menu = { id: '1', parentId: null, code: 'ROOT' } as Menu;
    const child = { id: '2', parentId: '1', code: 'CHILD' } as Menu;
    const permission = {
      id: '10',
      menuId: '1',
      code: 'root.view',
      description: 'View root',
      action: { code: 'VIEW' },
    } as Permission;
    menuRepository.findOne.mockResolvedValue(menu);
    menuRepository.find.mockResolvedValue([child]);
    permissionRepository.find.mockResolvedValue([permission]);

    await expect(service.findOne('1')).resolves.toEqual({
      ...menu,
      children: [child],
      permissions: [permission],
    });
    expect(menuRepository.find).toHaveBeenCalledWith({
      where: { parentId: '1' },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
    expect(permissionRepository.find).toHaveBeenCalledWith({
      where: { menuId: '1' },
      relations: ['action'],
      order: { createdAt: 'ASC' },
    });
  });

  it('rejects an update that points to a missing parent', async () => {
    const menu = { id: '2', parentId: null } as Menu;
    menuRepository.findOne
      .mockResolvedValueOnce(menu)
      .mockResolvedValueOnce(null);

    await expect(
      service.update('2', { parentId: '999', isActive: false }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(menuRepository.save).not.toHaveBeenCalled();
  });

  it('rejects deleting a menu that still has children with a bad request error', async () => {
    menuRepository.findOne.mockResolvedValue({ id: '1' } as Menu);
    menuRepository.count.mockResolvedValue(1);

    await expect(service.remove('1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(menuRepository.remove).not.toHaveBeenCalled();
  });

  it('rejects deleting a menu that still has permissions with a bad request error', async () => {
    menuRepository.findOne.mockResolvedValue({ id: '1' } as Menu);
    menuRepository.count.mockResolvedValue(0);
    permissionRepository.count.mockResolvedValue(1);

    await expect(service.remove('1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(permissionRepository.count).toHaveBeenCalledWith({
      where: { menuId: '1' },
    });
    expect(menuRepository.remove).not.toHaveBeenCalled();
  });

  it('deletes a menu with no children and no permissions', async () => {
    const menu = { id: '1' } as Menu;
    menuRepository.findOne.mockResolvedValue(menu);
    menuRepository.count.mockResolvedValue(0);
    permissionRepository.count.mockResolvedValue(0);

    await expect(service.remove('1')).resolves.toEqual({
      message: 'Menu deleted successfully',
    });
    expect(menuRepository.remove).toHaveBeenCalledWith(menu);
  });
});
