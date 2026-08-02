import { BadRequestException } from '@nestjs/common';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import {
  MATERIAL_IMAGE_MAX_SIZE,
  MaterialImageFile,
  MaterialImageStorageService,
} from './material-image-storage.service';

describe('MaterialImageStorageService', () => {
  let rootDirectory: string;
  let service: MaterialImageStorageService;

  beforeEach(async () => {
    rootDirectory = await mkdtemp(join(tmpdir(), 'cps-material-images-'));
    service = new MaterialImageStorageService(rootDirectory);
  });

  afterEach(async () => {
    await rm(rootDirectory, { recursive: true, force: true });
  });

  function file(
    mimetype = 'image/png',
    size = 4,
    buffer = Buffer.from('image'),
  ): MaterialImageFile {
    return {
      mimetype,
      size,
      buffer,
    };
  }

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

  it('rejects an image larger than 5 MiB before writing', async () => {
    await expect(
      service.stage(file('image/png', MATERIAL_IMAGE_MAX_SIZE + 1)),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(access(join(rootDirectory, '.tmp'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('uses a server-owned random filename and the MIME-derived extension', async () => {
    const staged = await service.stage(
      file('image/png', 5, Buffer.from('image')),
    );

    expect(staged.imagePath).toMatch(
      /^\/uploads\/materials\/\.tmp\/[0-9a-f-]{36}\.png$/,
    );
    expect(staged.previewUrl).toMatch(
      /^\/uploads\/materials\/\.tmp\/[0-9a-f-]{36}\.png$/,
    );
    expect(staged.previewUrl).toBe(staged.imagePath);
    expect(staged.imagePath).not.toContain('client-name');
    await expect(
      readFile(join(rootDirectory, '.tmp', basename(staged.imagePath))),
    ).resolves.toEqual(Buffer.from('image'));
  });

  it('atomically promotes a generated temporary path and discards it idempotently', async () => {
    const staged = await service.stage(
      file('image/webp', 4, Buffer.from('webp')),
    );

    const promotedPath = await service.promote(staged.imagePath);

    expect(promotedPath).toMatch(/^\/uploads\/materials\/[0-9a-f-]{36}\.webp$/);
    await expect(
      access(join(rootDirectory, '.tmp', basename(staged.imagePath))),
    ).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(
      readFile(join(rootDirectory, basename(promotedPath))),
    ).resolves.toEqual(Buffer.from('webp'));

    await expect(service.discard(promotedPath)).resolves.toBeUndefined();
    await expect(service.discard(promotedPath)).resolves.toBeUndefined();
    await expect(
      access(join(rootDirectory, basename(promotedPath))),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects traversal and non-generated promotion paths without touching outside files', async () => {
    const outsidePath = join(
      rootDirectory,
      '..',
      `${basename(rootDirectory)}.txt`,
    );
    await writeFile(outsidePath, 'keep');

    await expect(
      service.promote('/uploads/materials/.tmp/../outside.jpg'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.promote('/uploads/materials/.tmp/not-generated.png'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.discard('/uploads/materials/../../outside.txt'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(readFile(outsidePath, 'utf8')).resolves.toBe('keep');

    await rm(outsidePath, { force: true });
  });
});
