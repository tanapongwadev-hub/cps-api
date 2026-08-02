import { HttpStatus, INestApplication, RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  INTERCEPTORS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { REQUIRE_ANY_PERMISSIONS_KEY } from '../../common/decorators/require-any-permissions.decorator';
import { REQUIRE_PERMISSIONS_KEY } from '../../common/decorators/require-permissions.decorator';
import { ActiveAssignmentGuard } from '../../common/guards/active-assignment.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { CreateMaterialDto } from './dto/create-material.dto';
import { ListMaterialsQueryDto } from './dto/list-materials-query.dto';
import { UpdateMaterialDto } from './dto/update-material.dto';
import {
  MaterialImageFile,
  MATERIAL_IMAGE_MAX_SIZE,
  MaterialImageStorageService,
} from './material-image-storage.service';
import { MATERIAL_PERMISSIONS } from './material-permissions';
import { MaterialsController } from './materials.controller';
import { MaterialsService } from './materials.service';

describe('MaterialsController', () => {
  const service = {
    findAll: jest.fn(),
    getLookups: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    deactivate: jest.fn(),
    restore: jest.fn(),
  };
  const imageStorage = { stage: jest.fn() };
  const controller = new MaterialsController(
    service as unknown as MaterialsService,
    imageStorage as unknown as MaterialImageStorageService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('declares the approved routes, ordering, and permission metadata', () => {
    const prototype = MaterialsController.prototype;
    const routes = [
      ['findAll', '/', RequestMethod.GET, MATERIAL_PERMISSIONS.VIEW],
      ['getLookups', 'lookups', RequestMethod.GET, MATERIAL_PERMISSIONS.VIEW],
      ['findOne', ':id', RequestMethod.GET, MATERIAL_PERMISSIONS.VIEW],
      ['create', '/', RequestMethod.POST, MATERIAL_PERMISSIONS.CREATE],
      ['update', ':id', RequestMethod.PATCH, MATERIAL_PERMISSIONS.UPDATE],
      ['deactivate', ':id', RequestMethod.DELETE, MATERIAL_PERMISSIONS.DELETE],
      [
        'restore',
        ':id/restore',
        RequestMethod.PATCH,
        MATERIAL_PERMISSIONS.UPDATE,
      ],
    ] as const;

    expect(Reflect.getMetadata(PATH_METADATA, MaterialsController)).toBe(
      'materials',
    );
    for (const [name, path, method, permission] of routes) {
      const handler = prototype[name];
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(method);
      expect(Reflect.getMetadata(REQUIRE_PERMISSIONS_KEY, handler)).toEqual([
        permission,
      ]);
      expect(
        Reflect.getMetadata(REQUIRE_ANY_PERMISSIONS_KEY, handler),
      ).toBeUndefined();
    }

    const methodNames = Object.getOwnPropertyNames(prototype);
    const routeCount = methodNames.filter(
      (name) =>
        name !== 'constructor' &&
        Reflect.getMetadata(
          METHOD_METADATA,
          prototype[name as keyof MaterialsController],
        ) !== undefined,
    ).length;
    expect(routeCount).toBe(8);
    expect(methodNames.indexOf('getLookups')).toBeLessThan(
      methodNames.indexOf('findOne'),
    );
  });

  it('guards every route with authentication, active assignment, and permission checks', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, MaterialsController)).toEqual([
      JwtAuthGuard,
      ActiveAssignmentGuard,
      PermissionGuard,
    ]);
  });

  it('accepts file field uploads when create or update permission is granted', () => {
    const methodName: keyof MaterialsController = 'stageImage';
    const handler = MaterialsController.prototype[methodName];

    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('images');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata(REQUIRE_ANY_PERMISSIONS_KEY, handler)).toEqual([
      MATERIAL_PERMISSIONS.CREATE,
      MATERIAL_PERMISSIONS.UPDATE,
    ]);
    expect(
      Reflect.getMetadata(REQUIRE_PERMISSIONS_KEY, handler),
    ).toBeUndefined();
    expect(Reflect.getMetadata(INTERCEPTORS_METADATA, handler)).toHaveLength(1);
  });

  it('forwards route parameters, validated DTOs, and current user IDs', async () => {
    const query = { page: 2, limit: 10 } as ListMaterialsQueryDto;
    const createDto = {
      code: 'MAT-001',
      name: 'Steel coil',
      unitId: '1',
    } as CreateMaterialDto;
    const updateDto = {
      name: 'Steel sheet',
      updatedAt: '2026-08-01T10:00:00.000Z',
    } as UpdateMaterialDto;

    await controller.findAll(query);
    await controller.getLookups();
    await controller.findOne('20');
    await controller.create(createDto, '7');
    await controller.update('20', updateDto, '8');
    await controller.deactivate('20', '9');
    await controller.restore('20', '10');

    expect(service.findAll).toHaveBeenCalledWith(query);
    expect(service.getLookups).toHaveBeenCalledWith();
    expect(service.findOne).toHaveBeenCalledWith('20');
    expect(service.create).toHaveBeenCalledWith(createDto, '7');
    expect(service.update).toHaveBeenCalledWith('20', updateDto, '8');
    expect(service.deactivate).toHaveBeenCalledWith('20', '9');
    expect(service.restore).toHaveBeenCalledWith('20', '10');
  });

  it('passes the uploaded file to staging and returns its paths', async () => {
    const file: MaterialImageFile = {
      mimetype: 'image/png',
      size: 5,
      buffer: Buffer.from('image'),
    };
    imageStorage.stage.mockResolvedValue({
      imagePath: '/uploads/materials/.tmp/image.png',
      previewUrl: '/uploads/materials/.tmp/image.png',
    });

    await expect(controller.stageImage(file)).resolves.toEqual({
      imagePath: '/uploads/materials/.tmp/image.png',
      previewUrl: '/uploads/materials/.tmp/image.png',
    });
    expect(imageStorage.stage).toHaveBeenCalledWith(file);
  });

  it('rejects multipart files larger than 5 MiB before staging', async () => {
    const uploadStorage = { stage: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      controllers: [MaterialsController],
      providers: [
        { provide: MaterialsService, useValue: service },
        { provide: MaterialImageStorageService, useValue: uploadStorage },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ActiveAssignmentGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();
    const app: INestApplication<App> = moduleRef.createNestApplication();
    await app.init();

    const response = await request(app.getHttpServer())
      .post('/materials/images')
      .attach('file', Buffer.alloc(MATERIAL_IMAGE_MAX_SIZE + 1), {
        filename: 'large.png',
        contentType: 'image/png',
      });

    expect(response.status).toBe(HttpStatus.PAYLOAD_TOO_LARGE);
    expect(uploadStorage.stage).not.toHaveBeenCalled();
    await app.close();
  });
});
