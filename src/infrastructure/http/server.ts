import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { extname } from 'node:path';
import { z } from 'zod';
import type { ExtractDocumentService } from '../../application/extract-document';
import {
  EXTENSION_TO_MEDIA_TYPE,
  SUPPORTED_MEDIA_TYPES,
  type LoadedDocument,
} from '../../domain/documents/document';
import {
  DocExtractError,
  ErrorCode,
  isDocExtractError,
  type ErrorCode as ErrorCodeType,
} from '../../domain/errors/errors';
import { nullLogger, type Logger } from '../logging/logger';

export interface ExtractionServerOptions {
  service: ExtractDocumentService;
  reviewThreshold: number;
  /** Max decoded document size; also bounds the request body. */
  maxFileBytes: number;
  logger?: Logger;
}

/** Request body for POST /extract. Document bytes arrive base64-encoded. */
const ExtractRequestSchema = z.object({
  fileName: z.string().min(1),
  mediaType: z.enum(SUPPORTED_MEDIA_TYPES).optional(),
  base64: z.string().min(1),
  strict: z.boolean().optional(),
});

/** Lightweight transport-level error (distinct from domain DocExtractError). */
class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly hint?: string,
  ) {
    super(message);
  }
}

/** Map a domain error code to the most appropriate HTTP status. */
function statusForCode(code: ErrorCodeType): number {
  switch (code) {
    case ErrorCode.FILE_NOT_FOUND:
      return 400;
    case ErrorCode.FILE_TOO_LARGE:
      return 413;
    case ErrorCode.UNSUPPORTED_FILE_TYPE:
      return 415;
    case ErrorCode.EXTRACTION_PARSE_FAILED:
    case ErrorCode.VALIDATION_FAILED:
      return 422;
    case ErrorCode.LLM_RATE_LIMIT:
      return 429;
    case ErrorCode.LLM_TIMEOUT:
      return 504;
    case ErrorCode.LLM_SERVER:
    case ErrorCode.LLM_UNKNOWN:
      return 502;
    case ErrorCode.CONFIG_INVALID:
    case ErrorCode.LLM_AUTH:
      return 500;
    default:
      return 500;
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(payload);
}

/** Read the request body with a hard size cap to avoid unbounded memory use. */
function readBody(req: IncomingMessage, maxBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new HttpError(413, 'FILE_TOO_LARGE', 'Request body exceeds the configured limit.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function toLoadedDocument(
  body: z.infer<typeof ExtractRequestSchema>,
  maxFileBytes: number,
): LoadedDocument {
  const inferred = EXTENSION_TO_MEDIA_TYPE[extname(body.fileName).toLowerCase()];
  const mediaType = body.mediaType ?? inferred;
  if (!mediaType) {
    throw new HttpError(
      415,
      'UNSUPPORTED_FILE_TYPE',
      `Cannot determine media type for "${body.fileName}".`,
      'Pass mediaType explicitly or use a supported extension (.pdf/.png/.jpg/.jpeg/.webp).',
    );
  }

  const sizeBytes = Buffer.from(body.base64, 'base64').length;
  if (sizeBytes > maxFileBytes) {
    throw new HttpError(
      413,
      'FILE_TOO_LARGE',
      `Document is ${(sizeBytes / 1024 / 1024).toFixed(2)} MB but the limit is ${(maxFileBytes / 1024 / 1024).toFixed(2)} MB.`,
    );
  }

  return { fileName: body.fileName, mediaType, base64: body.base64, sizeBytes };
}

async function handleExtract(
  req: IncomingMessage,
  res: ServerResponse,
  options: ExtractionServerOptions,
): Promise<void> {
  // Allow generous slack over the decoded limit for base64 (~1.37x) + JSON envelope.
  const maxBody = Math.ceil(options.maxFileBytes * 1.5) + 16 * 1024;
  const raw = await readBody(req, maxBody);

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new HttpError(400, 'BAD_REQUEST', 'Request body is not valid JSON.');
  }

  const parsed = ExtractRequestSchema.safeParse(json);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
    throw new HttpError(400, 'BAD_REQUEST', `Invalid request body: ${issues.join('; ')}.`);
  }

  const document = toLoadedDocument(parsed.data, options.maxFileBytes);
  const result = await options.service.runOnDocument(document, {
    reviewThreshold: options.reviewThreshold,
    strict: parsed.data.strict ?? false,
  });
  sendJson(res, 200, result);
}

/**
 * A dependency-free HTTP adapter exposing the extraction service.
 *
 *   GET  /health   → liveness probe
 *   POST /extract  → { fileName, base64, mediaType?, strict? } → ExtractionResult
 *
 * Every error is returned as `{ error: { code, message, hint } }` with a status
 * that mirrors the domain error, so clients can react programmatically.
 */
export function createExtractionServer(options: ExtractionServerOptions): Server {
  const logger = options.logger ?? nullLogger;

  return createServer((req, res) => {
    const route = `${req.method ?? 'GET'} ${(req.url ?? '/').split('?')[0]}`;

    void (async () => {
      try {
        if (route === 'GET /health') {
          sendJson(res, 200, { status: 'ok' });
          return;
        }
        if (route === 'POST /extract') {
          await handleExtract(req, res, options);
          return;
        }
        throw new HttpError(404, 'NOT_FOUND', `No route for ${route}.`);
      } catch (error) {
        if (error instanceof HttpError) {
          sendJson(res, error.status, {
            error: { code: error.code, message: error.message, hint: error.hint },
          });
        } else if (isDocExtractError(error)) {
          const status = statusForCode(error.code);
          // Server-side faults (5xx) are worth logging; client faults (4xx) are not.
          if (status >= 500) logger.error({ err: (error as DocExtractError).toJSON() }, 'Extraction failed');
          sendJson(res, status, {
            error: { code: error.code, message: error.message, hint: error.hint },
          });
        } else {
          logger.error({ err: String(error) }, 'Unexpected server error');
          sendJson(res, 500, {
            error: { code: 'INTERNAL', message: 'Unexpected server error.' },
          });
        }
      }
    })();
  });
}
