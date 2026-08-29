import { BadRequestException } from '@nestjs/common';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import {
  PRODUCT_IMAGE_MAX_SIZE,
  ProductImageFile,
  ProductImageStorageService,
} from './product-image-storage.service';

describe('ProductImageStorageService', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const webp = Buffer.from('RIFF\x04\x00\x00\x00WEBP', 'binary');
  let rootDirectory: string;
  let service: ProductImageStorageService;

  beforeEach(async () => {
    rootDirectory = await mkdtemp(join(tmpdir(), 'cps-product-images-'));
    service = new ProductImageStorageService(rootDirectory);
  });

  afterEach(async () => {
    await rm(rootDirectory, { recursive: true, force: true });
  });

  function file(
    mimetype = 'image/png',
    size = png.byteLength,
    buffer = png,
  ): ProductImageFile {
    return { mimetype, size, buffer };
  }

  it('stages a validated image under the products temporary URL', async () => {
    const staged = await service.stage(file());

    expect(staged.imagePath).toMatch(
      /^\/uploads\/products\/\.tmp\/[0-9a-f-]{36}\.png$/,
    );
    expect(staged.previewUrl).toMatch(
      /^\/uploads\/products\/\.tmp\/[0-9a-f-]{36}\.png$/,
    );
    expect(staged.previewUrl).toBe(staged.imagePath);
    await expect(
      readFile(join(rootDirectory, '.tmp', basename(staged.imagePath))),
    ).resolves.toEqual(png);
  });

  it.each(['application/pdf', 'image/gif'])(
    'rejects unsupported MIME type %s before writing',
    async (mimetype) => {
      await expect(service.stage(file(mimetype))).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(access(join(rootDirectory, '.tmp'))).rejects.toMatchObject({
        code: 'ENOENT',
      });
    },
  );

  it('rejects oversized and MIME-mismatched image content', async () => {
    await expect(
      service.stage(file('image/png', PRODUCT_IMAGE_MAX_SIZE + 1)),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.stage(file('image/png', 3, Buffer.from('bad'))),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('promotes a staged file and can discard the committed file idempotently', async () => {
    const staged = await service.stage(
      file('image/webp', webp.byteLength, webp),
    );

    const promotedPath = await service.promote(staged.imagePath);

    expect(promotedPath).toMatch(/^\/uploads\/products\/[0-9a-f-]{36}\.webp$/);
    await expect(
      access(join(rootDirectory, '.tmp', basename(staged.imagePath))),
    ).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(
      readFile(join(rootDirectory, basename(promotedPath))),
    ).resolves.toEqual(webp);
    await expect(service.discard(promotedPath)).resolves.toBeUndefined();
    await expect(service.discard(promotedPath)).resolves.toBeUndefined();
  });

  it('rejects traversal and non-generated paths without touching outside files', async () => {
    const outsidePath = join(
      rootDirectory,
      '..',
      `${basename(rootDirectory)}.txt`,
    );
    await writeFile(outsidePath, 'keep');

    await expect(
      service.promote('/uploads/products/.tmp/../outside.jpg'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.promote('/uploads/products/.tmp/not-generated.png'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.discard('/uploads/products/../../outside.txt'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(readFile(outsidePath, 'utf8')).resolves.toBe('keep');

    await rm(outsidePath, { force: true });
  });
});
