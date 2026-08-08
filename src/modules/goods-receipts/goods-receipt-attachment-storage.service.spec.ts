import { BadRequestException } from '@nestjs/common';
import { mkdtemp, readdir, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import {
  GOODS_RECEIPT_ATTACHMENT_MAX_SIZE,
  GoodsReceiptAttachmentStorageService,
} from './goods-receipt-attachment-storage.service';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const PDF = Buffer.concat([Buffer.from('%PDF-1.7'), Buffer.alloc(16)]);
const WEBP = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.alloc(4),
  Buffer.from('WEBP'),
]);

describe('GoodsReceiptAttachmentStorageService', () => {
  let root: string;
  let service: GoodsReceiptAttachmentStorageService;

  beforeEach(async () => {
    root = await mkdtemp(resolve(tmpdir(), 'gr-attachments-'));
    service = new GoodsReceiptAttachmentStorageService(root);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('accepts PDF, which the Material image service does not', async () => {
    const staged = await service.stage({
      originalname: 'delivery-note.pdf',
      mimetype: 'application/pdf',
      size: PDF.byteLength,
      buffer: PDF,
    });
    expect(staged.filePath).toMatch(
      /^\/uploads\/goods-receipts\/\.tmp\/[0-9a-f-]{36}\.pdf$/,
    );
    expect(staged.fileName).toBe('delivery-note.pdf');
  });

  it.each([
    ['image/jpeg', JPEG, 'jpg'],
    ['image/png', PNG, 'png'],
    ['image/webp', WEBP, 'webp'],
  ])('accepts %s', async (mimetype, buffer, extension) => {
    const staged = await service.stage({
      mimetype,
      size: buffer.byteLength,
      buffer,
    });
    expect(staged.filePath.endsWith(`.${extension}`)).toBe(true);
  });

  it('rejects an unsupported MIME type', async () => {
    await expect(
      service.stage({
        mimetype: 'application/zip',
        size: 4,
        buffer: Buffer.from('PK\u0003\u0004'),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects content whose magic bytes do not match the MIME type', async () => {
    await expect(
      service.stage({
        mimetype: 'application/pdf',
        size: 8,
        buffer: Buffer.from('not-a-pdf'),
      }),
    ).rejects.toThrow(/does not match its MIME type/);
  });

  it('rejects a file larger than 10 MiB', async () => {
    const oversized = Buffer.concat([
      PDF,
      Buffer.alloc(GOODS_RECEIPT_ATTACHMENT_MAX_SIZE),
    ]);
    await expect(
      service.stage({
        mimetype: 'application/pdf',
        size: oversized.byteLength,
        buffer: oversized,
      }),
    ).rejects.toThrow(/10 MiB/);
  });

  it('rejects a missing file', async () => {
    await expect(service.stage(undefined)).rejects.toThrow(
      /Attachment file is required/,
    );
  });

  it('strips directory components from the uploaded file name', async () => {
    const staged = await service.stage({
      originalname: '../../etc/passwd.pdf',
      mimetype: 'application/pdf',
      size: PDF.byteLength,
      buffer: PDF,
    });
    expect(staged.fileName).toBe('passwd.pdf');
  });

  it('moves a staged file out of .tmp when promoted', async () => {
    const staged = await service.stage({
      mimetype: 'application/pdf',
      size: PDF.byteLength,
      buffer: PDF,
    });
    const promoted = await service.promote(staged.filePath);
    expect(promoted).toMatch(/^\/uploads\/goods-receipts\/[0-9a-f-]{36}\.pdf$/);
    expect(await readdir(resolve(root, '.tmp'))).toEqual([]);
  });

  it('reports the real size and MIME type of a promoted file', async () => {
    const staged = await service.stage({
      mimetype: 'application/pdf',
      size: PDF.byteLength,
      buffer: PDF,
    });
    const promoted = await service.promote(staged.filePath);
    await expect(service.describe(promoted)).resolves.toEqual({
      mimeType: 'application/pdf',
      fileSize: PDF.byteLength,
    });
  });

  it('refuses to promote a path outside the temporary directory', async () => {
    await expect(
      service.promote('/uploads/goods-receipts/already-promoted.pdf'),
    ).rejects.toThrow(/Invalid temporary attachment path/);
  });

  it('refuses to touch a path that escapes the storage root', async () => {
    await expect(
      service.discard('/uploads/goods-receipts/../../secrets.env'),
    ).rejects.toThrow(/Invalid attachment path/);
  });

  it('refuses a path outside the public prefix', async () => {
    await expect(service.discard('/uploads/materials/a.jpg')).rejects.toThrow(
      /Invalid attachment path/,
    );
  });

  it('discards a promoted file without failing when it is already gone', async () => {
    await expect(
      service.discard('/uploads/goods-receipts/missing.pdf'),
    ).resolves.toBeUndefined();
  });

  it('removes stale temporary files but keeps fresh ones', async () => {
    const staged = await service.stage({
      mimetype: 'application/pdf',
      size: PDF.byteLength,
      buffer: PDF,
    });
    const stalePath = resolve(root, '.tmp', 'stale.pdf');
    await writeFile(stalePath, PDF);
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    await utimes(stalePath, twoDaysAgo, twoDaysAgo);

    await service.cleanupStaleTemporaryFiles();

    const remaining = await readdir(resolve(root, '.tmp'));
    expect(remaining).not.toContain('stale.pdf');
    expect(remaining).toContain(staged.filePath.split('/').pop());
  });
});
