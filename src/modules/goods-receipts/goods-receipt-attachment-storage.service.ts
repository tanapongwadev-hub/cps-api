import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { lstat, mkdir, opendir, rename, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

export const GOODS_RECEIPT_ATTACHMENT_MAX_SIZE = 10 * 1024 * 1024;
export const GOODS_RECEIPT_ATTACHMENT_MAX_COUNT = 10;
export const GOODS_RECEIPT_ATTACHMENT_ROOT = Symbol(
  'GOODS_RECEIPT_ATTACHMENT_ROOT',
);

const PUBLIC_PREFIX = '/uploads/goods-receipts/';
const TEMPORARY_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const TEMPORARY_CLEANUP_ENTRY_LIMIT = 100;
const TEMPORARY_PATH =
  /^\/uploads\/goods-receipts\/\.tmp\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:jpg|png|webp|pdf))$/;
const EXTENSION_BY_MIME: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};
const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

export interface StagedGoodsReceiptAttachment {
  filePath: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  previewUrl: string;
}

export interface GoodsReceiptAttachmentFile {
  originalname?: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Injectable()
export class GoodsReceiptAttachmentStorageService {
  private readonly logger = new Logger(
    GoodsReceiptAttachmentStorageService.name,
  );
  private readonly rootDirectory: string;

  constructor(
    @Optional()
    @Inject(GOODS_RECEIPT_ATTACHMENT_ROOT)
    rootDirectory?: string,
  ) {
    this.rootDirectory = resolve(
      rootDirectory ?? resolve(process.cwd(), 'uploads', 'goods-receipts'),
    );
  }

  async stage(
    file?: GoodsReceiptAttachmentFile,
  ): Promise<StagedGoodsReceiptAttachment> {
    if (!file || !Buffer.isBuffer(file.buffer)) {
      throw new BadRequestException('Attachment file is required');
    }
    const extension = EXTENSION_BY_MIME[file.mimetype];
    if (!extension) {
      throw new BadRequestException(
        'Attachment must be JPEG, PNG, WebP, or PDF',
      );
    }
    if (
      file.size > GOODS_RECEIPT_ATTACHMENT_MAX_SIZE ||
      file.buffer.byteLength > GOODS_RECEIPT_ATTACHMENT_MAX_SIZE
    ) {
      throw new BadRequestException('Attachment must not exceed 10 MiB');
    }
    if (!this.hasExpectedSignature(file.mimetype, file.buffer)) {
      throw new BadRequestException(
        'Attachment content does not match its MIME type',
      );
    }

    const filename = `${randomUUID()}.${extension}`;
    const temporaryDirectory = resolve(this.rootDirectory, '.tmp');
    await mkdir(temporaryDirectory, { recursive: true });
    await this.cleanupStaleTemporaryFiles();
    await writeFile(resolve(temporaryDirectory, filename), file.buffer, {
      flag: 'wx',
    });

    const filePath = `${PUBLIC_PREFIX}.tmp/${filename}`;
    return {
      filePath,
      fileName: this.sanitizeFileName(file.originalname) ?? filename,
      mimeType: file.mimetype,
      fileSize: file.buffer.byteLength,
      previewUrl: filePath,
    };
  }

  async promote(filePath: string): Promise<string> {
    const match = TEMPORARY_PATH.exec(filePath);
    if (!match) {
      throw new BadRequestException('Invalid temporary attachment path');
    }

    const sourcePath = this.resolveAttachmentPath(filePath);
    const filename = match[1];
    const destinationPath = resolve(this.rootDirectory, filename);
    await mkdir(this.rootDirectory, { recursive: true });
    try {
      await rename(sourcePath, destinationPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new BadRequestException('Temporary attachment not found');
      }
      throw error;
    }
    return `${PUBLIC_PREFIX}${filename}`;
  }

  async discard(filePath: string): Promise<void> {
    await rm(this.resolveAttachmentPath(filePath), { force: true });
  }

  /**
   * อ่านข้อมูลไฟล์ที่ promote แล้วจากดิสก์จริง
   * ไม่รับค่าขนาดหรือ MIME จาก client เพราะปลอมได้
   */
  async describe(
    filePath: string,
  ): Promise<{ mimeType: string; fileSize: number }> {
    const resolvedPath = this.resolveAttachmentPath(filePath);
    const file = await lstat(resolvedPath);
    if (!file.isFile()) {
      throw new BadRequestException('Attachment is not a file');
    }
    return {
      mimeType: this.mimeTypeFromPath(filePath),
      fileSize: file.size,
    };
  }

  private mimeTypeFromPath(filePath: string): string {
    if (filePath.endsWith('.pdf')) return 'application/pdf';
    if (filePath.endsWith('.png')) return 'image/png';
    if (filePath.endsWith('.webp')) return 'image/webp';
    return 'image/jpeg';
  }

  async cleanupStaleTemporaryFiles(): Promise<void> {
    const directory = resolve(this.rootDirectory, '.tmp');
    const entries: string[] = [];
    try {
      const temporaryFiles = await opendir(directory);
      for await (const entry of temporaryFiles) {
        entries.push(entry.name);
        if (entries.length === TEMPORARY_CLEANUP_ENTRY_LIMIT) break;
      }
    } catch (error) {
      this.logger.warn('Failed to inspect staged attachments', error);
      return;
    }

    const staleBefore = Date.now() - TEMPORARY_MAX_AGE_MS;
    await Promise.all(
      entries.map(async (entry) => {
        const candidatePath = resolve(directory, entry);
        try {
          const file = await lstat(candidatePath);
          if (file.isFile() && file.mtimeMs < staleBefore) {
            await rm(candidatePath, { force: true });
          }
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            this.logger.warn(
              `Failed to clean staged attachment ${entry}`,
              error,
            );
          }
        }
      }),
    );
  }

  private hasExpectedSignature(mimetype: string, buffer: Buffer): boolean {
    if (mimetype === 'image/jpeg') {
      return (
        buffer.byteLength >= 3 &&
        buffer[0] === 0xff &&
        buffer[1] === 0xd8 &&
        buffer[2] === 0xff
      );
    }
    if (mimetype === 'image/png') {
      return (
        buffer.byteLength >= PNG_SIGNATURE.byteLength &&
        buffer.subarray(0, PNG_SIGNATURE.byteLength).equals(PNG_SIGNATURE)
      );
    }
    if (mimetype === 'image/webp') {
      return (
        buffer.byteLength >= 12 &&
        buffer.toString('ascii', 0, 4) === 'RIFF' &&
        buffer.toString('ascii', 8, 12) === 'WEBP'
      );
    }
    if (mimetype === 'application/pdf') {
      return (
        buffer.byteLength >= 5 && buffer.toString('ascii', 0, 5) === '%PDF-'
      );
    }
    return false;
  }

  private sanitizeFileName(originalName?: string): string | null {
    if (typeof originalName !== 'string') return null;
    const trimmed = originalName.trim().replace(/[\r\n\0]/g, '');
    if (!trimmed) return null;
    const base = trimmed.split(/[\\/]/).pop() ?? '';
    if (!base || base === '.' || base === '..') return null;
    return base.slice(0, 255);
  }

  private resolveAttachmentPath(filePath: string): string {
    if (
      typeof filePath !== 'string' ||
      !filePath.startsWith(PUBLIC_PREFIX) ||
      filePath.includes('\0')
    ) {
      throw new BadRequestException('Invalid attachment path');
    }

    const relativePath = filePath.slice(PUBLIC_PREFIX.length);
    const resolvedPath = resolve(this.rootDirectory, relativePath);
    const rootRelativePath = relative(this.rootDirectory, resolvedPath);
    if (
      !relativePath ||
      !rootRelativePath ||
      isAbsolute(rootRelativePath) ||
      rootRelativePath === '..' ||
      rootRelativePath.startsWith(`..${sep}`)
    ) {
      throw new BadRequestException('Invalid attachment path');
    }
    return resolvedPath;
  }
}
