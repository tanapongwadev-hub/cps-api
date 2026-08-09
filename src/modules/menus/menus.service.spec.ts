import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { MenusService } from './menus.service';
import { Menu } from '../../entities/iam/menu.entity';
import { Permission } from '../../entities/iam/permission.entity';
import { Action } from '../../entities/iam/action.entity';

describe('MenusService', () => {
  let service: MenusService;
  let menuRepository: jest.Mocked<Repository<Menu>>;
  let permissionRepository: jest.Mocked<Repository<Permission>>;

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

    service = new MenusService(
      menuRepository,
      permissionRepository,
      {} as jest.Mocked<Repository<Action>>,
      {} as DataSource,
    );
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
