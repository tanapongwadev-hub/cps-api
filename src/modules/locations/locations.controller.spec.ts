import { RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { REQUIRE_PERMISSIONS_KEY } from '../../common/decorators/require-permissions.decorator';
import { ActiveAssignmentGuard } from '../../common/guards/active-assignment.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { LocationsController } from './locations.controller';
import { LOCATION_PERMISSIONS } from './location-permissions';
import { LocationsService } from './locations.service';

describe('LocationsController', () => {
  const service = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    deactivate: jest.fn(),
    restore: jest.fn(),
  };
  const controller = new LocationsController(
    service as unknown as LocationsService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('declares the approved routes and permission metadata', () => {
    const prototype = LocationsController.prototype;
    const routes = [
      ['findAll', '/', RequestMethod.GET, LOCATION_PERMISSIONS.VIEW],
      ['findOne', ':id', RequestMethod.GET, LOCATION_PERMISSIONS.VIEW],
      ['create', '/', RequestMethod.POST, LOCATION_PERMISSIONS.CREATE],
      ['update', ':id', RequestMethod.PATCH, LOCATION_PERMISSIONS.UPDATE],
      ['deactivate', ':id', RequestMethod.DELETE, LOCATION_PERMISSIONS.DELETE],
      [
        'restore',
        ':id/restore',
        RequestMethod.PATCH,
        LOCATION_PERMISSIONS.UPDATE,
      ],
    ] as const;

    expect(Reflect.getMetadata(PATH_METADATA, LocationsController)).toBe(
      'locations',
    );
    for (const [name, path, method, permission] of routes) {
      const handler = prototype[name];
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(method);
      expect(Reflect.getMetadata(REQUIRE_PERMISSIONS_KEY, handler)).toEqual([
        permission,
      ]);
    }
  });

  it('guards every route with auth, active assignment, and permission checks', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, LocationsController)).toEqual([
      JwtAuthGuard,
      ActiveAssignmentGuard,
      PermissionGuard,
    ]);
  });

  it('forwards route parameters, DTOs, and current user IDs', async () => {
    const query = { page: 1 } as any;
    const createDto = { code: 'LOC-01', nameTh: 'คลัง A' } as any;
    const updateDto = {
      nameTh: 'x',
      updatedAt: '2026-08-04T00:00:00.000Z',
    } as any;

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
