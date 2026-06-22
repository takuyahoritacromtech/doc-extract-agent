import { describe, expect, it } from 'vitest';
import {
  ExtractDocumentService,
  type DocumentExtractor,
  type FileLoader,
} from '../../src/application/extract-document';
import { ValidationError } from '../../src/domain/errors/errors';
import type { LoadedDocument } from '../../src/domain/documents/document';
import type { ExtractionEnvelope } from '../../src/domain/documents/invoice';
import { makeEnvelope, makeInvoice } from '../fixtures/invoices';

const loaded: LoadedDocument = {
  fileName: 'invoice.png',
  mediaType: 'image/png',
  base64: 'AAAA',
  sizeBytes: 3,
};

const stubLoader: FileLoader = { load: () => Promise.resolve(loaded) };

function extractorReturning(envelope: ExtractionEnvelope): DocumentExtractor {
  return { extract: () => Promise.resolve(envelope) };
}

function buildService(envelope: ExtractionEnvelope): ExtractDocumentService {
  return new ExtractDocumentService({ fileLoader: stubLoader, extractor: extractorReturning(envelope) });
}

describe('ExtractDocumentService.run', () => {
  it('returns a clean result for a consistent, high-confidence invoice', async () => {
    const result = await buildService(makeEnvelope()).run('x.png', { reviewThreshold: 0.75 });
    expect(result.needsReview).toBe(false);
    expect(result.warnings).toEqual([]);
    expect(result.source.fileName).toBe('invoice.png');
  });

  it('flags review (without throwing) when totals are inconsistent', async () => {
    const envelope = makeEnvelope({ invoice: makeInvoice({ totalAmount: 9999 }) });
    const result = await buildService(envelope).run('x.png', { reviewThreshold: 0.75 });
    expect(result.needsReview).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('throws ValidationError in strict mode when totals are inconsistent', async () => {
    const envelope = makeEnvelope({ invoice: makeInvoice({ totalAmount: 9999 }) });
    await expect(
      buildService(envelope).run('x.png', { reviewThreshold: 0.75, strict: true }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('flags review when a field is below the confidence threshold', async () => {
    const envelope = makeEnvelope({ fieldConfidence: { vendorName: 0.4 }, overallConfidence: 0.9 });
    const result = await buildService(envelope).run('x.png', { reviewThreshold: 0.75 });
    expect(result.needsReview).toBe(true);
    expect(result.fields.find((f) => f.field === 'vendorName')?.needsReview).toBe(true);
  });
});
