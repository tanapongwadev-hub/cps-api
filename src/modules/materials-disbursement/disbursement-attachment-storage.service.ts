import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export const DISBURSEMENT_ATTACHMENT_MAX_SIZE = 10 * 1024 * 1024;
export const DISBURSEMENT_ATTACHMENT_PREFIX = '/uploads/materials-disbursement/';

const EXTENSION_BY_MIME: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

export interface DisbursementAttachmentFile {
  mimetype: string;
  size: number;
  buffer: Buffer;
  originalname?: string;
}

export interface StoredDisbursementAttachment {
  attachmentUrl: string;
  attachmentName: string;
}

export function getDisbursementAttachmentRoot(root?: string): string {
  return resolve(
    root ??
      process.env.DISBURSEMENT_ATTACHMENT_ROOT ??
      resolve(process.cwd(), 'uploads', 'materials-disbursement'),
  );
}

/**
 * multer/busboy decode multipart filenames as latin1, so UTF-8 names (Thai)
 * arrive as mojibake. If every char fits in one byte and the bytes form valid
 * UTF-8, re-decode; otherwise keep the name as-is.
 */
export function decodeUploadedFilename(name: string): string {
  if (/[^\u0000-\u00ff]/.test(name)) return name;
  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  return decoded.includes('\ufffd') ? name : decoded;
}

function hasExpectedSignature(mimetype: string, buffer: Buffer): boolean {
  switch (mimetype) {
    case 'image/jpeg':
      return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8;
    case 'image/png':
      return buffer.length >= 8 && buffer.toString('hex', 0, 4) === '89504e47';
    case 'image/webp':
      return (
        buffer.length >= 12 &&
        buffer.toString('ascii', 0, 4) === 'RIFF' &&
        buffer.toString('ascii', 8, 12) === 'WEBP'
      );
    case 'application/pdf':
      return buffer.length >= 5 && buffer.toString('ascii', 0, 5) === '%PDF-';
    default:
      return false;
  }
}

@Injectable()
export class DisbursementAttachmentStorageService {
  async store(
    file?: DisbursementAttachmentFile,
  ): Promise<StoredDisbursementAttachment> {
    if (!file || !Buffer.isBuffer(file.buffer)) {
      throw new BadRequestException('Attachment file is required');
    }
    const extension = EXTENSION_BY_MIME[file.mimetype];
    if (!extension) {
      throw new BadRequestException('Attachment must be JPEG, PNG, WebP or PDF');
    }
    if (
      file.size > DISBURSEMENT_ATTACHMENT_MAX_SIZE ||
      file.buffer.byteLength > DISBURSEMENT_ATTACHMENT_MAX_SIZE
    ) {
      throw new BadRequestException('Attachment must not exceed 10 MiB');
    }
    if (!hasExpectedSignature(file.mimetype, file.buffer)) {
      throw new BadRequestException(
        'Attachment content does not match its MIME type',
      );
    }
    const root = getDisbursementAttachmentRoot();
    await mkdir(root, { recursive: true });
    const filename = `${randomUUID()}.${extension}`;
    await writeFile(resolve(root, filename), file.buffer, { flag: 'wx' });
    const originalName = decodeUploadedFilename(
      file.originalname ?? `attachment.${extension}`,
    )
      .replace(/[\r\n\0]/g, '')
      .slice(0, 255);
    return {
      attachmentUrl: `${DISBURSEMENT_ATTACHMENT_PREFIX}${filename}`,
      attachmentName: originalName,
    };
  }
}
