import {
  BadRequestException,
  Inject,
  Injectable,
  Optional,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

export const MATERIAL_IMAGE_MAX_SIZE = 5 * 1024 * 1024;
export const MATERIAL_IMAGE_ROOT = Symbol('MATERIAL_IMAGE_ROOT');

const PUBLIC_MATERIAL_PREFIX = '/uploads/materials/';
const TEMPORARY_MATERIAL_PATH =
  /^\/uploads\/materials\/\.tmp\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:jpg|png|webp))$/;
const EXTENSION_BY_MIME: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export interface StagedMaterialImage {
  imagePath: string;
  previewUrl: string;
}

export interface MaterialImageFile {
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Injectable()
export class MaterialImageStorageService {
  private readonly rootDirectory: string;

  constructor(
    @Optional()
    @Inject(MATERIAL_IMAGE_ROOT)
    rootDirectory?: string,
  ) {
    this.rootDirectory = resolve(
      rootDirectory ?? resolve(process.cwd(), 'uploads', 'materials'),
    );
  }

  async stage(file?: MaterialImageFile): Promise<StagedMaterialImage> {
    if (!file || !Buffer.isBuffer(file.buffer)) {
      throw new BadRequestException('Material image file is required');
    }
    const extension = EXTENSION_BY_MIME[file.mimetype];
    if (!extension) {
      throw new BadRequestException(
        'Material image must be JPEG, PNG, or WebP',
      );
    }
    if (
      file.size > MATERIAL_IMAGE_MAX_SIZE ||
      file.buffer.byteLength > MATERIAL_IMAGE_MAX_SIZE
    ) {
      throw new BadRequestException('Material image must not exceed 5 MiB');
    }

    const filename = `${randomUUID()}.${extension}`;
    const temporaryDirectory = resolve(this.rootDirectory, '.tmp');
    await mkdir(temporaryDirectory, { recursive: true });
    await writeFile(resolve(temporaryDirectory, filename), file.buffer, {
      flag: 'wx',
    });

    const imagePath = `${PUBLIC_MATERIAL_PREFIX}.tmp/${filename}`;
    return { imagePath, previewUrl: imagePath };
  }

  async promote(imagePath: string): Promise<string> {
    const match = TEMPORARY_MATERIAL_PATH.exec(imagePath);
    if (!match) {
      throw new BadRequestException('Invalid temporary Material image path');
    }

    const sourcePath = this.resolveMaterialPath(imagePath);
    const filename = match[1];
    const destinationPath = resolve(this.rootDirectory, filename);
    await mkdir(this.rootDirectory, { recursive: true });
    try {
      await rename(sourcePath, destinationPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new BadRequestException('Temporary Material image not found');
      }
      throw error;
    }
    return `${PUBLIC_MATERIAL_PREFIX}${filename}`;
  }

  async discard(imagePath: string): Promise<void> {
    await rm(this.resolveMaterialPath(imagePath), { force: true });
  }

  private resolveMaterialPath(imagePath: string): string {
    if (
      typeof imagePath !== 'string' ||
      !imagePath.startsWith(PUBLIC_MATERIAL_PREFIX) ||
      imagePath.includes('\0')
    ) {
      throw new BadRequestException('Invalid Material image path');
    }

    const relativePath = imagePath.slice(PUBLIC_MATERIAL_PREFIX.length);
    const resolvedPath = resolve(this.rootDirectory, relativePath);
    const rootRelativePath = relative(this.rootDirectory, resolvedPath);
    if (
      !relativePath ||
      !rootRelativePath ||
      isAbsolute(rootRelativePath) ||
      rootRelativePath === '..' ||
      rootRelativePath.startsWith(`..${sep}`)
    ) {
      throw new BadRequestException('Invalid Material image path');
    }
    return resolvedPath;
  }
}
