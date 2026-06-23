import { describe, expect, it } from 'vitest';
import { toCsv, toJson } from '../../src/infrastructure/output/writers';
import type { ExtractionResult } from '../../src/domain/extraction/result';
import { makeInvoice } from '../fixtures/invoices';

function makeResult(overrides: Partial<ExtractionResult> = {}): ExtractionResult {
  return {
    invoice: makeInvoice(),
    overallConfidence: 0.96,
    fields: [],
    needsReview: false,
    warnings: [],
    notes: null,
    source: { fileName: 'invoice.png', mediaType: 'image/png', sizeBytes: 10 },
    ...overrides,
  };
}

describe('toJson', () => {
  it('round-trips to an equivalent object', () => {
    const result = makeResult();
    expect(JSON.parse(toJson(result))).toEqual(result);
  });
});

describe('toCsv', () => {
  it('emits a header and one row per line item', () => {
    const csv = toCsv(makeResult());
    const lines = csv.split('\n');
    expect(lines[0]).toContain('vendorName');
    expect(lines).toHaveLength(2); // header + 1 line item
    expect(lines[1]).toContain('Widget');
  });

  it('quotes cells containing commas or quotes per RFC 4180', () => {
    const result = makeResult({
      invoice: makeInvoice({
        vendorName: 'Acme, "Global"',
        lineItems: [{ description: 'A,B', quantity: 1, unitPrice: 1, amount: 1 }],
        subtotal: 1,
        taxAmount: 0,
        totalAmount: 1,
      }),
    });
    const csv = toCsv(result);
    expect(csv).toContain('"Acme, ""Global"""');
    expect(csv).toContain('"A,B"');
  });

  it('neutralises CSV formula injection from untrusted extracted values', () => {
    const result = makeResult({
      invoice: makeInvoice({ vendorName: '=HYPERLINK("http://evil","x")' }),
    });
    // The leading "=" is defused with a single quote so spreadsheets won't execute it.
    expect(toCsv(result)).toContain("'=HYPERLINK");
  });
});
