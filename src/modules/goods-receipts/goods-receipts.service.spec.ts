import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { DocumentCounter } from '../../entities/inventory/document-counter.entity';
import { GoodsReceiptAttachment } from '../../entities/inventory/goods-receipt-attachment.entity';
import { GoodsReceiptItem } from '../../entities/inventory/goods-receipt-item.entity';
import { GoodsReceipt } from '../../entities/inventory/goods-receipt.entity';
import { Material } from '../../entities/master/material.entity';
import { Organization } from '../../entities/master/organization.entity';
import { RejectReason } from '../../entities/master/reject-reason.entity';
import { SupplierMaterial } from '../../entities/master/supplier-material.entity';
import { Supplier } from '../../entities/master/supplier.entity';
import { Unit } from '../../entities/master/unit.entity';
import { GoodsReceiptAttachmentStorageService } from './goods-receipt-attachment-storage.service';
import { GoodsReceiptsService } from './goods-receipts.service';

const TODAY = new Date().toISOString().slice(0, 10);

function tomorrow(): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

interface RepoMock {
  create: jest.Mock;
  save: jest.Mock;
  find: jest.Mock;
  findOne: jest.Mock;
  count: jest.Mock;
  delete: jest.Mock;
  createQueryBuilder: jest.Mock;
}

function makeRepo(overrides: Partial<RepoMock> = {}): RepoMock {
  return {
    create: jest.fn((payload: unknown) => ({ ...(payload as object) })),
    save: jest.fn((entity: unknown) => Promise.resolve(entity)),
    find: jest.fn(() => Promise.resolve([])),
    findOne: jest.fn(() => Promise.resolve(null)),
    count: jest.fn(() => Promise.resolve(0)),
    delete: jest.fn(() => Promise.resolve({ affected: 1 })),
    createQueryBuilder: jest.fn(),
    ...overrides,
  };
}

function makeBuilder(result: {
  one?: unknown;
  many?: unknown[];
  raw?: unknown[];
}) {
  const builder: Record<string, jest.Mock> = {
    leftJoinAndSelect: jest.fn(() => builder),
    where: jest.fn(() => builder),
    andWhere: jest.fn(() => builder),
    select: jest.fn(() => builder),
    addSelect: jest.fn(() => builder),
    groupBy: jest.fn(() => builder),
    orderBy: jest.fn(() => builder),
    addOrderBy: jest.fn(() => builder),
    skip: jest.fn(() => builder),
    take: jest.fn(() => builder),
    getOne: jest.fn(() => Promise.resolve(result.one ?? null)),
    getMany: jest.fn(() => Promise.resolve(result.many ?? [])),
    getRawMany: jest.fn(() => Promise.resolve(result.raw ?? [])),
    getManyAndCount: jest.fn(() =>
      Promise.resolve([result.many ?? [], (result.many ?? []).length]),
    ),
  };
  return builder;
}

function makeReceipt(overrides: Partial<GoodsReceipt> = {}): GoodsReceipt {
  return {
    id: '10',
    receiptNo: null,
    organizationId: '1',
    supplierId: '2',
    receiptDate: TODAY,
    poNo: null,
    supplierDocNo: 'DN-001',
    supplierDocDate: null,
    noSupplierDocument: false,
    status: 'draft',
    remark: null,
    postedBy: null,
    postedAt: null,
    cancelledBy: null,
    cancelledAt: null,
    cancelReason: null,
    createdBy: '9',
    updatedBy: '9',
    createdAt: new Date('2026-08-08T00:00:00.000Z'),
    updatedAt: new Date('2026-08-08T00:00:00.000Z'),
    ...overrides,
  } as GoodsReceipt;
}

function makeItem(overrides: Partial<GoodsReceiptItem> = {}) {
  return {
    id: '100',
    goodsReceiptId: '10',
    lineNo: 1,
    materialId: '5',
    materialCode: null,
    materialName: null,
    unitId: '3',
    qtyDelivered: '10.0000',
    qtyReceived: '10.0000',
    qtyRejected: '0.0000',
    rejectReasonId: null,
    rejectNote: null,
    lotNo: null,
    productionDate: null,
    expiryDate: null,
    unitPrice: null,
    lineAmount: null,
    remark: null,
    ...overrides,
  } as GoodsReceiptItem;
}

describe('GoodsReceiptsService', () => {
  let service: GoodsReceiptsService;
  let receiptRepo: RepoMock;
  let itemRepo: RepoMock;
  let attachmentRepo: RepoMock;
  let supplierRepo: RepoMock;
  let materialRepo: RepoMock;
  let unitRepo: RepoMock;
  let rejectReasonRepo: RepoMock;
  let counterRepo: RepoMock;
  let organizationRepo: RepoMock;
  let supplierMaterialRepo: RepoMock;
  let managerQuery: jest.Mock;
  let storage: {
    promote: jest.Mock;
    discard: jest.Mock;
    describe: jest.Mock;
  };

  beforeEach(async () => {
    receiptRepo = makeRepo();
    itemRepo = makeRepo();
    attachmentRepo = makeRepo();
    supplierRepo = makeRepo({
      findOne: jest.fn(() => Promise.resolve({ id: '2', isActive: true })),
    });
    materialRepo = makeRepo({
      find: jest.fn(() =>
        Promise.resolve([
          {
            id: '5',
            code: 'MAT-5',
            name: 'ปูนซีเมนต์',
            unitId: '3',
            isActive: true,
          },
          { id: '6', code: 'MAT-6', name: 'ทราย', unitId: '3', isActive: true },
        ]),
      ),
    });
    unitRepo = makeRepo();
    rejectReasonRepo = makeRepo({
      find: jest.fn(() => Promise.resolve([{ id: '7', isActive: true }])),
    });
    counterRepo = makeRepo({
      findOne: jest.fn(() =>
        Promise.resolve({
          id: '1',
          organizationId: '1',
          docType: 'GOODS_RECEIPT',
          period: '202608',
          lastNumber: 0,
        }),
      ),
    });
    organizationRepo = makeRepo({
      findOne: jest.fn(() =>
        Promise.resolve({ id: '1', code: 'CPS', isActive: true }),
      ),
    });
    supplierMaterialRepo = makeRepo({
      find: jest.fn(() =>
        Promise.resolve([
          { supplierId: '2', materialId: '5', isActive: true },
          { supplierId: '2', materialId: '6', isActive: true },
        ]),
      ),
    });
    managerQuery = jest.fn(() => Promise.resolve(undefined));

    const repositoryByEntity = new Map<unknown, RepoMock>([
      [GoodsReceipt, receiptRepo],
      [GoodsReceiptItem, itemRepo],
      [GoodsReceiptAttachment, attachmentRepo],
      [DocumentCounter, counterRepo],
      [Organization, organizationRepo],
      [Supplier, supplierRepo],
      [SupplierMaterial, supplierMaterialRepo],
      [Material, materialRepo],
      [Unit, unitRepo],
      [RejectReason, rejectReasonRepo],
    ]);

    const dataSource = {
      getRepository: (entity: unknown) => repositoryByEntity.get(entity),
      transaction: jest.fn((callback: (manager: unknown) => unknown) =>
        Promise.resolve(
          callback({
            getRepository: (entity: unknown) => repositoryByEntity.get(entity),
            query: managerQuery,
          }),
        ),
      ),
    };

    storage = {
      promote: jest.fn((path: string) =>
        Promise.resolve(path.replace('/.tmp/', '/')),
      ),
      discard: jest.fn(() => Promise.resolve(undefined)),
      describe: jest.fn(() =>
        Promise.resolve({ mimeType: 'application/pdf', fileSize: 2048 }),
      ),
    };

    // findOne() ที่ service เรียกท้าย command ทุกตัว
    receiptRepo.createQueryBuilder.mockImplementation(() =>
      makeBuilder({ one: makeReceipt() }),
    );
    itemRepo.createQueryBuilder.mockImplementation(() =>
      makeBuilder({ many: [makeItem()], raw: [] }),
    );

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        GoodsReceiptsService,
        { provide: getRepositoryToken(GoodsReceipt), useValue: receiptRepo },
        { provide: getRepositoryToken(GoodsReceiptItem), useValue: itemRepo },
        {
          provide: getRepositoryToken(GoodsReceiptAttachment),
          useValue: attachmentRepo,
        },
        { provide: getRepositoryToken(Supplier), useValue: supplierRepo },
        { provide: getRepositoryToken(Material), useValue: materialRepo },
        { provide: getRepositoryToken(Unit), useValue: unitRepo },
        {
          provide: getRepositoryToken(RejectReason),
          useValue: rejectReasonRepo,
        },
        { provide: getDataSourceToken(), useValue: dataSource },
        {
          provide: GoodsReceiptAttachmentStorageService,
          useValue: storage,
        },
      ],
    }).compile();

    service = moduleRef.get(GoodsReceiptsService);
  });

  const baseItem = {
    materialId: '5',
    qtyDelivered: '10',
    qtyReceived: '10',
  };

  const baseCreate = {
    supplierId: '2',
    receiptDate: TODAY,
    items: [baseItem],
  } as never;

  describe('startup default organization validation', () => {
    it('accepts the active configured default organization', async () => {
      await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
      expect(organizationRepo.findOne).toHaveBeenCalledWith({
        where: { code: 'CPS' },
      });
    });

    it('fails startup if the configured default organization does not exist', async () => {
      organizationRepo.findOne.mockResolvedValue(null);
      await expect(service.onApplicationBootstrap()).rejects.toThrow(
        'Default organization CPS does not exist',
      );
    });

    it('fails startup if the configured default organization is inactive', async () => {
      organizationRepo.findOne.mockResolvedValue({
        id: '1',
        code: 'CPS',
        isActive: false,
      });
      await expect(service.onApplicationBootstrap()).rejects.toThrow(
        'Default organization CPS is inactive',
      );
    });
  });

  describe('item rules', () => {
    it('rejects a receipt date in the future', async () => {
      await expect(
        service.create(
          { ...(baseCreate as object), receiptDate: tomorrow() } as never,
          'u1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects when received plus rejected exceeds delivered', async () => {
      await expect(
        service.create(
          {
            supplierId: '2',
            receiptDate: TODAY,
            items: [
              {
                materialId: '5',
                qtyDelivered: '10',
                qtyReceived: '8',
                qtyRejected: '3',
                rejectReasonId: '7',
              },
            ],
          },
          'u1',
        ),
      ).rejects.toThrow(/must not exceed qtyDelivered/);
    });

    it('accepts an exact split between received and rejected', async () => {
      await expect(
        service.create(
          {
            supplierId: '2',
            receiptDate: TODAY,
            items: [
              {
                materialId: '5',
                qtyDelivered: '10',
                qtyReceived: '7',
                qtyRejected: '3',
                rejectReasonId: '7',
              },
            ],
          },
          'u1',
        ),
      ).resolves.toBeDefined();
    });

    it('rejects a line where both quantities are zero', async () => {
      await expect(
        service.create(
          {
            supplierId: '2',
            receiptDate: TODAY,
            items: [{ materialId: '5', qtyDelivered: '10', qtyReceived: '0' }],
          },
          'u1',
        ),
      ).rejects.toThrow(/greater than zero/);
    });

    it('requires a reject reason when something is rejected', async () => {
      await expect(
        service.create(
          {
            supplierId: '2',
            receiptDate: TODAY,
            items: [
              {
                materialId: '5',
                qtyDelivered: '10',
                qtyReceived: '7',
                qtyRejected: '3',
              },
            ],
          },
          'u1',
        ),
      ).rejects.toThrow(/rejectReasonId is required/);
    });

    it('rejects a reject reason when nothing is rejected', async () => {
      await expect(
        service.create(
          {
            supplierId: '2',
            receiptDate: TODAY,
            items: [
              {
                materialId: '5',
                qtyDelivered: '10',
                qtyReceived: '10',
                qtyRejected: '0',
                rejectReasonId: '7',
              },
            ],
          },
          'u1',
        ),
      ).rejects.toThrow(/must be empty when nothing is rejected/);
    });

    it('rejects the same material and lot appearing twice', async () => {
      await expect(
        service.create(
          {
            supplierId: '2',
            receiptDate: TODAY,
            items: [
              {
                materialId: '5',
                qtyDelivered: '5',
                qtyReceived: '5',
                lotNo: 'L1',
              },
              {
                materialId: '5',
                qtyDelivered: '5',
                qtyReceived: '5',
                lotNo: 'L1',
              },
            ],
          },
          'u1',
        ),
      ).rejects.toThrow(/cannot appear twice/);
    });

    it('allows the same material across different lots', async () => {
      await expect(
        service.create(
          {
            supplierId: '2',
            receiptDate: TODAY,
            items: [
              {
                materialId: '5',
                qtyDelivered: '5',
                qtyReceived: '5',
                lotNo: 'L1',
              },
              {
                materialId: '5',
                qtyDelivered: '5',
                qtyReceived: '5',
                lotNo: 'L2',
              },
            ],
          },
          'u1',
        ),
      ).resolves.toBeDefined();
    });

    it('compares decimals without losing precision', async () => {
      await expect(
        service.create(
          {
            supplierId: '2',
            receiptDate: TODAY,
            items: [
              {
                materialId: '5',
                qtyDelivered: '10.0001',
                qtyReceived: '10.0002',
              },
            ],
          },
          'u1',
        ),
      ).rejects.toThrow(/must not exceed qtyDelivered/);
    });
  });

  describe('create', () => {
    it('stores the draft with the configured organization and no receipt number', async () => {
      await service.create(baseCreate, 'u1');
      expect(receiptRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: '1',
          supplierId: '2',
          status: 'draft',
          receiptNo: null,
          createdBy: 'u1',
        }),
      );
    });

    it('numbers lines sequentially and copies the material unit', async () => {
      await service.create(
        {
          supplierId: '2',
          receiptDate: TODAY,
          items: [
            { materialId: '5', qtyDelivered: '1', qtyReceived: '1' },
            { materialId: '6', qtyDelivered: '2', qtyReceived: '2' },
          ],
        },
        'u1',
      );
      expect(itemRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ lineNo: 1, materialId: '5', unitId: '3' }),
      );
      expect(itemRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ lineNo: 2, materialId: '6', unitId: '3' }),
      );
    });

    it('leaves the material snapshot empty until the receipt is posted', async () => {
      await service.create(baseCreate, 'u1');
      expect(itemRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ materialCode: null, materialName: null }),
      );
    });

    it('rejects a material that is not linked to the supplier', async () => {
      supplierMaterialRepo.find.mockResolvedValue([]);
      await expect(service.create(baseCreate, 'u1')).rejects.toThrow(
        /is not linked to supplier/,
      );
    });

    it('rejects an inactive supplier', async () => {
      supplierRepo.findOne.mockResolvedValue({ id: '2', isActive: false });
      await expect(service.create(baseCreate, 'u1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects an inactive reject reason', async () => {
      rejectReasonRepo.find.mockResolvedValue([{ id: '7', isActive: false }]);
      await expect(
        service.create(
          {
            supplierId: '2',
            receiptDate: TODAY,
            items: [
              {
                materialId: '5',
                qtyDelivered: '10',
                qtyReceived: '7',
                qtyRejected: '3',
                rejectReasonId: '7',
              },
            ],
          },
          'u1',
        ),
      ).rejects.toThrow(/is inactive/);
    });

    it('fails when the configured default organization is missing', async () => {
      organizationRepo.findOne.mockResolvedValue(null);
      await expect(service.create(baseCreate, 'u1')).rejects.toThrow(
        /Default organization/,
      );
    });

    it('discards promoted attachments when the transaction fails', async () => {
      attachmentRepo.save.mockRejectedValue(new Error('boom'));
      await expect(
        service.create(
          {
            ...(baseCreate as object),
            attachments: [
              {
                docType: 'DELIVERY_NOTE',
                filePath: '/uploads/goods-receipts/.tmp/a.pdf',
                fileName: 'dn.pdf',
              },
            ],
          } as never,
          'u1',
        ),
      ).rejects.toThrow('boom');
      expect(storage.discard).toHaveBeenCalledWith(
        '/uploads/goods-receipts/a.pdf',
      );
    });

    it('reads the real file size from disk instead of trusting the client', async () => {
      await service.create(
        {
          ...(baseCreate as object),
          attachments: [
            {
              docType: 'TAX_INVOICE',
              filePath: '/uploads/goods-receipts/.tmp/b.pdf',
              fileName: 'inv.pdf',
            },
          ],
        } as never,
        'u1',
      );
      expect(storage.describe).toHaveBeenCalledWith(
        '/uploads/goods-receipts/b.pdf',
      );
      expect(attachmentRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          fileSize: 2048,
          mimeType: 'application/pdf',
        }),
      );
    });
  });

  describe('update', () => {
    it('rejects editing a posted receipt', async () => {
      receiptRepo.findOne.mockResolvedValue(makeReceipt({ status: 'posted' }));
      await expect(
        service.update('10', { updatedAt: '2026-08-08T00:00:00.000Z' }, 'u1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects a stale updatedAt', async () => {
      receiptRepo.findOne.mockResolvedValue(makeReceipt());
      await expect(
        service.update('10', { updatedAt: '2020-01-01T00:00:00.000Z' }, 'u1'),
      ).rejects.toThrow(/has been updated/);
    });

    it('returns 404 when the receipt does not exist', async () => {
      receiptRepo.findOne.mockResolvedValue(null);
      await expect(
        service.update('10', { updatedAt: '2026-08-08T00:00:00.000Z' }, 'u1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('replaces the whole item set when items are supplied', async () => {
      receiptRepo.findOne.mockResolvedValue(makeReceipt());
      await service.update(
        '10',
        {
          updatedAt: '2026-08-08T00:00:00.000Z',
          items: [{ materialId: '6', qtyDelivered: '4', qtyReceived: '4' }],
        },
        'u1',
      );
      expect(itemRepo.delete).toHaveBeenCalledWith({ goodsReceiptId: '10' });
      expect(itemRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ materialId: '6', lineNo: 1 }),
      );
    });
  });

  describe('post', () => {
    beforeEach(() => {
      receiptRepo.findOne.mockResolvedValue(makeReceipt());
      itemRepo.find.mockResolvedValue([makeItem()]);
    });

    it('rejects posting a receipt without items', async () => {
      itemRepo.find.mockResolvedValue([]);
      await expect(service.post('10', 'u1')).rejects.toThrow(
        /at least one item/,
      );
    });

    it('requires a supplier document number unless flagged otherwise', async () => {
      receiptRepo.findOne.mockResolvedValue(
        makeReceipt({ supplierDocNo: null, noSupplierDocument: false }),
      );
      await expect(service.post('10', 'u1')).rejects.toThrow(
        /supplierDocNo is required/,
      );
    });

    it('allows posting without a supplier document when flagged', async () => {
      receiptRepo.findOne.mockResolvedValue(
        makeReceipt({ supplierDocNo: null, noSupplierDocument: true }),
      );
      await expect(service.post('10', 'u1')).resolves.toBeDefined();
    });

    it('rejects posting a receipt that is not a draft', async () => {
      receiptRepo.findOne.mockResolvedValue(makeReceipt({ status: 'posted' }));
      await expect(service.post('10', 'u1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('snapshots the material code and name onto every line', async () => {
      await service.post('10', 'u1');
      expect(itemRepo.save).toHaveBeenCalledWith([
        expect.objectContaining({
          materialCode: 'MAT-5',
          materialName: 'ปูนซีเมนต์',
        }),
      ]);
    });

    it('allocates a monthly receipt number and records who posted it', async () => {
      const period = `${TODAY.slice(0, 4)}${TODAY.slice(5, 7)}`;
      await service.post('10', 'u1');
      expect(receiptRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          receiptNo: `GR-${period}-0001`,
          status: 'posted',
          postedBy: 'u1',
          postedAt: expect.any(Date) as Date,
        }),
      );
    });

    it('creates the counter row when the period has no counter yet', async () => {
      counterRepo.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ lastNumber: 41 });
      await service.post('10', 'u1');
      expect(managerQuery).toHaveBeenCalledWith(
        expect.stringContaining('inventory.document_counters'),
        expect.any(Array),
      );
      expect(receiptRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          receiptNo: expect.stringMatching(/-0042$/) as string,
        }),
      );
    });
  });

  describe('cancel', () => {
    it('rejects cancelling a draft', async () => {
      receiptRepo.findOne.mockResolvedValue(makeReceipt({ status: 'draft' }));
      await expect(
        service.cancel('10', { cancelReason: 'ผิดพลาด' }, 'u1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('records who cancelled, when, and why', async () => {
      receiptRepo.findOne.mockResolvedValue(makeReceipt({ status: 'posted' }));
      await service.cancel('10', { cancelReason: '  กรอกผิด  ' }, 'u1');
      expect(receiptRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'cancelled',
          cancelledBy: 'u1',
          cancelReason: 'กรอกผิด',
          cancelledAt: expect.any(Date) as Date,
        }),
      );
    });

    it('keeps the receipt number after cancellation', async () => {
      receiptRepo.findOne.mockResolvedValue(
        makeReceipt({ status: 'posted', receiptNo: 'GR-202608-0007' }),
      );
      await service.cancel('10', { cancelReason: 'x' }, 'u1');
      expect(receiptRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ receiptNo: 'GR-202608-0007' }),
      );
    });
  });

  describe('remove', () => {
    it('deletes a draft and discards its attachment files', async () => {
      receiptRepo.findOne.mockResolvedValue(makeReceipt({ status: 'draft' }));
      attachmentRepo.find.mockResolvedValue([
        { filePath: '/uploads/goods-receipts/c.pdf' },
      ]);
      await service.remove('10');
      expect(receiptRepo.delete).toHaveBeenCalledWith({ id: '10' });
      expect(storage.discard).toHaveBeenCalledWith(
        '/uploads/goods-receipts/c.pdf',
      );
    });

    it('refuses to delete a posted receipt', async () => {
      receiptRepo.findOne.mockResolvedValue(makeReceipt({ status: 'posted' }));
      await expect(service.remove('10')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('attachments', () => {
    it('refuses to attach files to a cancelled receipt', async () => {
      receiptRepo.findOne.mockResolvedValue(
        makeReceipt({ status: 'cancelled' }),
      );
      await expect(
        service.addAttachments(
          '10',
          {
            attachments: [
              {
                docType: 'PHOTO',
                filePath: '/uploads/goods-receipts/.tmp/d.png',
                fileName: 'd.png',
              },
            ],
          } as never,
          'u1',
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('allows attaching files to a posted receipt', async () => {
      receiptRepo.findOne.mockResolvedValue(makeReceipt({ status: 'posted' }));
      await expect(
        service.addAttachments(
          '10',
          {
            attachments: [
              {
                docType: 'TAX_INVOICE',
                filePath: '/uploads/goods-receipts/.tmp/e.pdf',
                fileName: 'e.pdf',
              },
            ],
          } as never,
          'u1',
        ),
      ).resolves.toBeDefined();
    });

    it('enforces the attachment count limit', async () => {
      receiptRepo.findOne.mockResolvedValue(makeReceipt({ status: 'posted' }));
      attachmentRepo.count.mockResolvedValue(10);
      await expect(
        service.addAttachments(
          '10',
          {
            attachments: [
              {
                docType: 'OTHER',
                filePath: '/uploads/goods-receipts/.tmp/f.pdf',
                fileName: 'f.pdf',
              },
            ],
          } as never,
          'u1',
        ),
      ).rejects.toThrow(/more than 10 attachments/);
    });

    it('only removes attachments while the receipt is a draft', async () => {
      receiptRepo.findOne.mockResolvedValue(makeReceipt({ status: 'posted' }));
      await expect(service.removeAttachment('10', '55')).rejects.toThrow(
        /while the goods receipt is a draft/,
      );
    });
  });
});
