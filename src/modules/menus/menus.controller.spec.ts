import { RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { RoleCode } from '../../common/enums/role-code.enum';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ReorderMenusDto } from './dto/reorder-menus.dto';
import { MenusController } from './menus.controller';
import { MenusService } from './menus.service';

describe('MenusController', () => {
  const service = {
    findManagementTree: jest.fn(),
    reorder: jest.fn(),
  };
  const controller = new MenusController(service as unknown as MenusService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function handlerFor(name: string): object {
    return Reflect.get(MenusController.prototype, name) as object;
  }

  it('delegates management-tree reads and reorder payloads to the service', async () => {
    const dto = {
      version: 'sha256:current',
      items: [{ id: '1', parentId: null, sortOrder: 0 }],
    } as ReorderMenusDto;
    service.findManagementTree.mockResolvedValue({
      version: 'sha256:current',
      menus: [],
    });
    service.reorder.mockResolvedValue({
      version: 'sha256:next',
      updatedCount: 1,
    });

    await expect(controller.findManagementTree()).resolves.toEqual({
      version: 'sha256:current',
      menus: [],
    });
    await expect(controller.reorder(dto)).resolves.toEqual({
      version: 'sha256:next',
      updatedCount: 1,
    });
    expect(service.findManagementTree).toHaveBeenCalledWith();
    expect(service.reorder).toHaveBeenCalledWith(dto);
  });

  it('declares management-tree and reorder as static routes before parameterized updates', () => {
    const prototype = MenusController.prototype;
    const findManagementTree = handlerFor('findManagementTree');
    const reorder = handlerFor('reorder');

    expect(Reflect.getMetadata(PATH_METADATA, findManagementTree)).toBe(
      'management-tree',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, findManagementTree)).toBe(
      RequestMethod.GET,
    );
    expect(Reflect.getMetadata(PATH_METADATA, reorder)).toBe('reorder');
    expect(Reflect.getMetadata(METHOD_METADATA, reorder)).toBe(
      RequestMethod.PATCH,
    );

    const methodNames = Object.getOwnPropertyNames(prototype);
    expect(methodNames.indexOf('findManagementTree')).toBeLessThan(
      methodNames.indexOf('update'),
    );
    expect(methodNames.indexOf('reorder')).toBeLessThan(
      methodNames.indexOf('update'),
    );
  });

  it('keeps every menu route guarded for SUPER_ADMIN only', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, MenusController)).toEqual([
      JwtAuthGuard,
      RolesGuard,
    ]);
    expect(Reflect.getMetadata(ROLES_KEY, MenusController)).toEqual([
      RoleCode.SUPER_ADMIN,
    ]);
  });
});
