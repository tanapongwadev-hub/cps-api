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
import { MaterialsReceivingController } from './materials-receiving.controller';
import { MATERIALS_RECEIVING_PERMISSIONS } from './materials-receiving-permissions';
import { MaterialsReceivingService } from './materials-receiving.service';

describe('MaterialsReceivingController', () => {
  const service = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    findByInternalLotNo: jest.fn(),
    getMaterialLookups: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    confirm: jest.fn(),
    cancel: jest.fn(),
  };
  const controller = new MaterialsReceivingController(
    service as unknown as MaterialsReceivingService,
  );

  beforeEach(() => jest.clearAllMocks());

  function handlerFor(name: string): object {
    return Reflect.get(MaterialsReceivingController.prototype, name) as object;
  }

  it('is mounted at /materials-receiving', () => {
    expect(
      Reflect.getMetadata(PATH_METADATA, MaterialsReceivingController),
    ).toBe('materials-receiving');
  });

  it('guards every route with auth, active assignment, and permission checks', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, MaterialsReceivingController),
    ).toEqual([JwtAuthGuard, ActiveAssignmentGuard, PermissionGuard]);
  });

  it('declares the approved routes and permission metadata', () => {
    const routes = [
      ['findAll', '/', RequestMethod.GET, MATERIALS_RECEIVING_PERMISSIONS.VIEW],
      [
        'getLookups',
        'lookups',
        RequestMethod.GET,
        MATERIALS_RECEIVING_PERMISSIONS.VIEW,
      ],
      [
        'findByInternalLotNo',
        'by-lot/:internalLotNo',
        RequestMethod.GET,
        MATERIALS_RECEIVING_PERMISSIONS.VIEW,
      ],
      [
        'findOne',
        ':id',
        RequestMethod.GET,
        MATERIALS_RECEIVING_PERMISSIONS.VIEW,
      ],
      [
        'create',
        '/',
        RequestMethod.POST,
        MATERIALS_RECEIVING_PERMISSIONS.CREATE,
      ],
      [
        'update',
        ':id',
        RequestMethod.PATCH,
        MATERIALS_RECEIVING_PERMISSIONS.UPDATE,
      ],
      [
        'remove',
        ':id',
        RequestMethod.DELETE,
        MATERIALS_RECEIVING_PERMISSIONS.DELETE,
      ],
      [
        'confirm',
        ':id/confirm',
        RequestMethod.POST,
        MATERIALS_RECEIVING_PERMISSIONS.CONFIRM,
      ],
      [
        'cancel',
        ':id/cancel',
        RequestMethod.POST,
        MATERIALS_RECEIVING_PERMISSIONS.CANCEL,
      ],
    ] as const;

    for (const [name, path, method, permission] of routes) {
      const handler = handlerFor(name);
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(method);
      const required = Reflect.getMetadata(
        REQUIRE_PERMISSIONS_KEY,
        handler,
      ) as string[];
      expect(required).toEqual([permission]);
    }
  });

  it('keeps confirm and cancel behind their own permissions', () => {
    expect(
      Reflect.getMetadata(REQUIRE_PERMISSIONS_KEY, handlerFor('confirm')),
    ).toEqual(['MATERIALS_RECEIVING_CONFIRM']);
    expect(
      Reflect.getMetadata(REQUIRE_PERMISSIONS_KEY, handlerFor('cancel')),
    ).toEqual(['MATERIALS_RECEIVING_CANCEL']);
  });

  it('passes user id from the request into mutating calls', () => {
    void controller.create({} as never, '42');
    expect(service.create).toHaveBeenCalledWith({}, '42');

    void controller.update('10', {} as never, '42');
    expect(service.update).toHaveBeenCalledWith('10', {}, '42');

    void controller.confirm('10', '42');
    expect(service.confirm).toHaveBeenCalledWith('10', '42');

    void controller.cancel('10', { cancelReason: 'x' }, '42');
    expect(service.cancel).toHaveBeenCalledWith(
      '10',
      { cancelReason: 'x' },
      '42',
    );
  });

  it('returns 204 on delete', () => {
    const metadata = Reflect.getMetadata('statusCode', handlerFor('remove')) as
      number | undefined;
    expect(metadata ?? 204).toBe(204);
  });
});
