import { readFile, stat } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import type { FileLoader } from '../../application/extract-document';
import {
  EXTENSION_TO_MEDIA_TYPE,
  type LoadedDocument,
  type SupportedMediaType,
} from '../../domain/documents/document';
import { ErrorCode, FileError } from '../../domain/errors/errors';

export interface FsFileLoaderOptions {
  /** Reject files larger than this many bytes (cheap guard against huge/abusive inputs). */
  maxFileBytes: number;
}

function formatMb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

/**
 * Loads a document from the local filesystem, validating type and size before
 * reading bytes into memory. Each rejection is a distinct, actionable FileError.
 */
export class FsFileLoader implements FileLoader {
  constructor(private readonly options: FsFileLoaderOptions) {}

  async load(filePath: string): Promise<LoadedDocument> {
    const mediaType = this.resolveMediaType(filePath);

    const info = await stat(filePath).catch((cause: unknown) => {
      throw new FileError(ErrorCode.FILE_NOT_FOUND, `File not found: ${filePath}.`, {
        hint: 'Check the path is correct and the file is readable.',
        cause,
        context: { filePath },
      });
    });

    if (!info.isFile()) {
      throw new FileError(ErrorCode.FILE_NOT_FOUND, `Not a regular file: ${filePath}.`, {
        hint: 'Provide a path to a document file, not a directory.',
        context: { filePath },
      });
    }

    if (info.size > this.options.maxFileBytes) {
      throw new FileError(
        ErrorCode.FILE_TOO_LARGE,
        `Document is ${formatMb(info.size)} but the limit is ${formatMb(this.options.maxFileBytes)}.`,
        {
          hint: 'Split the document or raise DOC_EXTRACT_MAX_FILE_MB.',
          context: { filePath, sizeBytes: info.size, maxFileBytes: this.options.maxFileBytes },
        },
      );
    }

    const bytes = await readFile(filePath);
    return {
      fileName: basename(filePath),
      mediaType,
      base64: bytes.toString('base64'),
      sizeBytes: info.size,
    };
  }

  private resolveMediaType(filePath: string): SupportedMediaType {
    const ext = extname(filePath).toLowerCase();
    const mediaType = EXTENSION_TO_MEDIA_TYPE[ext];
    if (!mediaType) {
      throw new FileError(
        ErrorCode.UNSUPPORTED_FILE_TYPE,
        `Unsupported file type "${ext || '(none)'}" for ${basename(filePath)}.`,
        {
          hint: `Supported extensions: ${Object.keys(EXTENSION_TO_MEDIA_TYPE).join(', ')}.`,
          context: { filePath },
        },
      );
    }
    return mediaType;
  }
}
