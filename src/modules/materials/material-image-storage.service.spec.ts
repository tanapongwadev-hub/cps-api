import { BadRequestException } from '@nestjs/common';
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import {
  MATERIAL_IMAGE_MAX_SIZE,
  MaterialImageFile,
  MaterialImageStorageService,
} from './material-image-storage.service';

describe('MaterialImageStorageService', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const webp = Buffer.from('RIFF\x04\x00\x00\x00WEBP', 'binary');
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
    size = png.byteLength,
    buffer = png,
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

  it.each([
    ['image/png', Buffer.from('not a png')],
    ['image/jpeg', Buffer.from('not a jpeg')],
    ['image/webp', Buffer.from('not a webp')],
    ['image/png', Buffer.from([0xff, 0xd8, 0xff])],
  ])(
    'rejects bytes that do not match declared MIME %s',
    async (mimetype, buffer) => {
      await expect(
        service.stage(file(mimetype, buffer.byteLength, buffer)),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(access(join(rootDirectory, '.tmp'))).rejects.toMatchObject({
        code: 'ENOENT',
      });
    },
  );

  it('uses a server-owned random filename and the MIME-derived extension', async () => {
    const staged = await service.stage(file('image/png', png.byteLength, png));

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
    ).resolves.toEqual(png);
  });

  it('atomically promotes a generated temporary path and discards it idempotently', async () => {
    const staged = await service.stage(
      file('image/webp', webp.byteLength, webp),
    );

    const promotedPath = await service.promote(staged.imagePath);

    expect(promotedPath).toMatch(/^\/uploads\/materials\/[0-9a-f-]{36}\.webp$/);
    await expect(
      access(join(rootDirectory, '.tmp', basename(staged.imagePath))),
    ).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(
      readFile(join(rootDirectory, basename(promotedPath))),
    ).resolves.toEqual(webp);

    await expect(service.discard(promotedPath)).resolves.toBeUndefined();
    await expect(service.discard(promotedPath)).resolves.toBeUndefined();
    await expect(
      access(join(rootDirectory, basename(promotedPath))),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('removes at most 100 temporary files older than 24 hours per stage call', async () => {
    const temporaryDirectory = join(rootDirectory, '.tmp');
    await mkdir(temporaryDirectory, { recursive: true });
    const staleTime = new Date(Date.now() - 25 * 60 * 60 * 1000);
    for (let index = 0; index < 101; index += 1) {
      const stalePath = join(
        temporaryDirectory,
        `stale-${index.toString().padStart(3, '0')}.png`,
      );
      await writeFile(stalePath, png);
      await utimes(stalePath, staleTime, staleTime);
    }
    const recentPath = join(temporaryDirectory, 'recent.png');
    await writeFile(recentPath, png);

    await service.stage(file('image/png', png.byteLength, png));

    const entries = await readdir(temporaryDirectory);
    const staleEntries = entries.filter((entry) => entry.startsWith('stale-'));
    expect(staleEntries.length).toBeGreaterThanOrEqual(1);
    expect(staleEntries.length).toBeLessThan(101);
    expect(entries).toContain('recent.png');
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
