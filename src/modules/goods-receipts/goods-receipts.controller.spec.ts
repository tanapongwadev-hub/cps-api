import { RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { REQUIRE_ANY_PERMISSIONS_KEY } from '../../common/decorators/require-any-permissions.decorator';
import { REQUIRE_PERMISSIONS_KEY } from '../../common/decorators/require-permissions.decorator';
import { ActiveAssignmentGuard } from '../../common/guards/active-assignment.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { GoodsReceiptAttachmentStorageService } from './goods-receipt-attachment-storage.service';
import { GOODS_RECEIPT_PERMISSIONS } from './goods-receipt-permissions';
import { GoodsReceiptsController } from './goods-receipts.controller';
import { GoodsReceiptsService } from './goods-receipts.service';

describe('GoodsReceiptsController', () => {
  const service = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    getLookups: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    post: jest.fn(),
    cancel: jest.fn(),
    addAttachments: jest.fn(),
    removeAttachment: jest.fn(),
  };
  const storage = { stage: jest.fn() };
  const controller = new GoodsReceiptsController(
    service as unknown as GoodsReceiptsService,
    storage as unknown as GoodsReceiptAttachmentStorageService,
  );

  beforeEach(() => jest.clearAllMocks());

  /** ดึง handler จาก prototype แบบไม่ผูก this เพื่ออ่าน metadata */
  function handlerFor(name: string): object {
    return Reflect.get(GoodsReceiptsController.prototype, name) as object;
  }

  it('is mounted at /goods-receipts', () => {
    expect(Reflect.getMetadata(PATH_METADATA, GoodsReceiptsController)).toBe(
      'goods-receipts',
    );
  });

  it('guards every route with auth, active assignment, and permission checks', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, GoodsReceiptsController),
    ).toEqual([JwtAuthGuard, ActiveAssignmentGuard, PermissionGuard]);
  });

  it('declares the approved routes and permission metadata', () => {
    const prototype = GoodsReceiptsController.prototype;
    expect(prototype).toBeDefined();
    const routes = [
      ['findAll', '/', RequestMethod.GET, GOODS_RECEIPT_PERMISSIONS.VIEW],
      [
        'getLookups',
        'lookups',
        RequestMethod.GET,
        GOODS_RECEIPT_PERMISSIONS.VIEW,
      ],
      ['findOne', ':id', RequestMethod.GET, GOODS_RECEIPT_PERMISSIONS.VIEW],
      ['create', '/', RequestMethod.POST, GOODS_RECEIPT_PERMISSIONS.CREATE],
      ['update', ':id', RequestMethod.PATCH, GOODS_RECEIPT_PERMISSIONS.UPDATE],
      ['remove', ':id', RequestMethod.DELETE, GOODS_RECEIPT_PERMISSIONS.DELETE],
      ['post', ':id/post', RequestMethod.POST, GOODS_RECEIPT_PERMISSIONS.POST],
      [
        'cancel',
        ':id/cancel',
        RequestMethod.POST,
        GOODS_RECEIPT_PERMISSIONS.CANCEL,
      ],
      [
        'removeAttachment',
        ':id/attachments/:attachmentId',
        RequestMethod.DELETE,
        GOODS_RECEIPT_PERMISSIONS.UPDATE,
      ],
    ] as const;

    for (const [name, path, method, permission] of routes) {
      const handler = handlerFor(name);
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(method);
      expect(Reflect.getMetadata(REQUIRE_PERMISSIONS_KEY, handler)).toEqual([
        permission,
      ]);
    }
  });

  it('keeps posting and cancelling behind their own permissions', () => {
    expect(
      Reflect.getMetadata(REQUIRE_PERMISSIONS_KEY, handlerFor('post')),
    ).toEqual(['GOODS_RECEIPT_POST']);
    expect(
      Reflect.getMetadata(REQUIRE_PERMISSIONS_KEY, handlerFor('cancel')),
    ).toEqual(['GOODS_RECEIPT_CANCEL']);
  });

  it('lets either create or update permission stage and attach files', () => {
    for (const name of ['stageAttachment', 'addAttachments'] as const) {
      expect(
        Reflect.getMetadata(REQUIRE_ANY_PERMISSIONS_KEY, handlerFor(name)),
      ).toEqual([
        GOODS_RECEIPT_PERMISSIONS.CREATE,
        GOODS_RECEIPT_PERMISSIONS.UPDATE,
      ]);
    }
  });

  it('forwards route parameters, DTOs, and current user ids', async () => {
    const createDto = { supplierId: '2' } as never;
    const updateDto = { updatedAt: '2026-08-08T00:00:00.000Z' } as never;
    const cancelDto = { cancelReason: 'x' } as never;
    const attachmentsDto = { attachments: [] } as never;

    await controller.create(createDto, 'u1');
    await controller.update('10', updateDto, 'u1');
    await controller.remove('10');
    await controller.post('10', 'u1');
    await controller.cancel('10', cancelDto, 'u1');
    await controller.addAttachments('10', attachmentsDto, 'u1');
    await controller.removeAttachment('10', '55');
    await controller.getLookups('2');

    expect(service.create).toHaveBeenCalledWith(createDto, 'u1');
    expect(service.update).toHaveBeenCalledWith('10', updateDto, 'u1');
    expect(service.remove).toHaveBeenCalledWith('10');
    expect(service.post).toHaveBeenCalledWith('10', 'u1');
    expect(service.cancel).toHaveBeenCalledWith('10', cancelDto, 'u1');
    expect(service.addAttachments).toHaveBeenCalledWith(
      '10',
      attachmentsDto,
      'u1',
    );
    expect(service.removeAttachment).toHaveBeenCalledWith('10', '55');
    expect(service.getLookups).toHaveBeenCalledWith('2');
  });

  it('delegates file staging to the attachment storage service', () => {
    const file = { mimetype: 'application/pdf' } as never;
    void controller.stageAttachment(file);
    expect(storage.stage).toHaveBeenCalledWith(file);
  });
});
