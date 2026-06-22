import { describe, expect, it } from 'vitest';
import { ExtractionEnvelopeSchema } from '../../src/domain/documents/invoice';
import { makeEnvelope } from '../fixtures/invoices';

describe('ExtractionEnvelopeSchema', () => {
  it('accepts a well-formed envelope', () => {
    const result = ExtractionEnvelopeSchema.safeParse(makeEnvelope());
    expect(result.success).toBe(true);
  });

  it('rejects an envelope missing a required invoice field', () => {
    const broken = makeEnvelope();
    // Simulate the model omitting totalAmount.
    delete (broken.invoice as Record<string, unknown>).totalAmount;
    const result = ExtractionEnvelopeSchema.safeParse(broken);
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('invoice.totalAmount');
    }
  });

  it('rejects confidence values outside 0..1', () => {
    const result = ExtractionEnvelopeSchema.safeParse(makeEnvelope({ overallConfidence: 1.5 }));
    expect(result.success).toBe(false);
  });
});
