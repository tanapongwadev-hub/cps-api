import { RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { REQUIRE_PERMISSIONS_KEY } from '../../common/decorators/require-permissions.decorator';
import { ActiveAssignmentGuard } from '../../common/guards/active-assignment.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { CreateUnitDto } from './dto/create-unit.dto';
import { ListUnitsQueryDto } from './dto/list-units-query.dto';
import { UpdateUnitDto } from './dto/update-unit.dto';
import { UNIT_PERMISSIONS } from './unit-permissions';
import { UnitsController } from './units.controller';
import { UnitsService } from './units.service';

describe('UnitsController', () => {
  const service = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    deactivate: jest.fn(),
    restore: jest.fn(),
  };
  const controller = new UnitsController(service as unknown as UnitsService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('declares the approved routes, ordering, and permission metadata', () => {
    const prototype = UnitsController.prototype;
    const routes = [
      ['findAll', '/', RequestMethod.GET, UNIT_PERMISSIONS.VIEW],
      ['findOne', ':id', RequestMethod.GET, UNIT_PERMISSIONS.VIEW],
      ['create', '/', RequestMethod.POST, UNIT_PERMISSIONS.CREATE],
      ['update', ':id', RequestMethod.PATCH, UNIT_PERMISSIONS.UPDATE],
      ['deactivate', ':id', RequestMethod.DELETE, UNIT_PERMISSIONS.DELETE],
      [
        'restore',
        ':id/restore',
        RequestMethod.PATCH,
        UNIT_PERMISSIONS.UPDATE,
      ],
    ] as const;

    expect(Reflect.getMetadata(PATH_METADATA, UnitsController)).toBe('units');
    for (const [name, path, method, permission] of routes) {
      const handler = prototype[name];
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(method);
      expect(Reflect.getMetadata(REQUIRE_PERMISSIONS_KEY, handler)).toEqual([
        permission,
      ]);
    }

    const methodNames = Object.getOwnPropertyNames(prototype);
    const routeCount = methodNames.filter(
      (name) =>
        name !== 'constructor' &&
        Reflect.getMetadata(METHOD_METADATA, prototype[name as keyof UnitsController]) !==
          undefined,
    ).length;
    expect(routeCount).toBe(6);
  });

  it('guards every route with authentication, active assignment, and permission checks', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, UnitsController)).toEqual([
      JwtAuthGuard,
      ActiveAssignmentGuard,
      PermissionGuard,
    ]);
  });

  it('forwards route parameters, validated DTOs, and current user IDs', async () => {
    const query = { page: 2, limit: 10 } as ListUnitsQueryDto;
    const createDto = { code: 'PCS', nameTh: 'ชิ้น' } as CreateUnitDto;
    const updateDto = {
      nameTh: 'กิโลกรัม',
      updatedAt: '2026-08-04T00:00:00.000Z',
    } as UpdateUnitDto;

    await controller.findAll(query);
    await controller.findOne('20');
    await controller.create(createDto, '7');
    await controller.update('20', updateDto, '8');
    await controller.deactivate('20', '9');
    await controller.restore('20', '10');

    expect(service.findAll).toHaveBeenCalledWith(query);
    expect(service.findOne).toHaveBeenCalledWith('20');
    expect(service.create).toHaveBeenCalledWith(createDto, '7');
    expect(service.update).toHaveBeenCalledWith('20', updateDto, '8');
    expect(service.deactivate).toHaveBeenCalledWith('20', '9');
    expect(service.restore).toHaveBeenCalledWith('20', '10');
  });
});
