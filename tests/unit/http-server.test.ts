import { afterEach, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createExtractionServer } from '../../src/infrastructure/http/server';
import type { ExtractDocumentService } from '../../src/application/extract-document';
import type { ExtractionResult } from '../../src/domain/extraction/result';
import { ErrorCode, ValidationError } from '../../src/domain/errors/errors';
import { makeInvoice } from '../fixtures/invoices';

function resultFixture(): ExtractionResult {
  return {
    invoice: makeInvoice(),
    overallConfidence: 0.96,
    fields: [{ field: 'vendorName', confidence: 0.98, needsReview: false }],
    needsReview: false,
    warnings: [],
    notes: null,
    source: { fileName: 'invoice.png', mediaType: 'image/png', sizeBytes: 2 },
  };
}

/** Build a stub service whose runOnDocument resolves or rejects as instructed. */
function stubService(behavior: { resolve?: ExtractionResult; reject?: unknown }): ExtractDocumentService {
  return {
    runOnDocument: () =>
      behavior.reject !== undefined ? Promise.reject(behavior.reject) : Promise.resolve(behavior.resolve),
  } as unknown as ExtractDocumentService;
}

let server: Server | undefined;

afterEach(async () => {
  if (server) {
    // Force idle keep-alive sockets shut so close() resolves immediately.
    server.closeAllConnections();
    await new Promise<void>((resolve) => server!.close(() => resolve()));
  }
  server = undefined;
});

async function start(service: ExtractDocumentService): Promise<string> {
  server = createExtractionServer({ service, reviewThreshold: 0.75, maxFileBytes: 1024 });
  await new Promise<void>((resolve) => server!.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

const b64 = (text: string): string => Buffer.from(text).toString('base64');

describe('HTTP server', () => {
  it('GET /health returns ok', async () => {
    const base = await start(stubService({ resolve: resultFixture() }));
    const res = await fetch(`${base}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  it('POST /extract returns the extraction result', async () => {
    const base = await start(stubService({ resolve: resultFixture() }));
    const res = await fetch(`${base}/extract`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fileName: 'invoice.png', base64: b64('hi') }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as ExtractionResult;
    expect(body.invoice.vendorName).toBe('Acme Inc.');
  });

  it('rejects a malformed body with 400', async () => {
    const base = await start(stubService({ resolve: resultFixture() }));
    const res = await fetch(`${base}/extract`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fileName: 'invoice.png' }), // missing base64
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('BAD_REQUEST');
  });

  it('rejects an oversized document with 413', async () => {
    const base = await start(stubService({ resolve: resultFixture() }));
    const res = await fetch(`${base}/extract`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fileName: 'invoice.png', base64: Buffer.alloc(2000).toString('base64') }),
    });
    expect(res.status).toBe(413);
  });

  it('maps a domain ValidationError to 422', async () => {
    const base = await start(stubService({ reject: new ValidationError('totals off', ['x']) }));
    const res = await fetch(`${base}/extract`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fileName: 'invoice.png', base64: b64('hi') }),
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe(ErrorCode.VALIDATION_FAILED);
  });

  it('returns 404 for unknown routes', async () => {
    const base = await start(stubService({ resolve: resultFixture() }));
    const res = await fetch(`${base}/nope`);
    expect(res.status).toBe(404);
  });
});
