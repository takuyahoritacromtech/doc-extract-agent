import { describe, expect, it } from 'vitest';
import { buildFieldReviews, validateBusinessRules } from '../../src/domain/extraction/validate';
import { makeInvoice } from '../fixtures/invoices';

describe('validateBusinessRules', () => {
  it('returns no warnings for a self-consistent invoice', () => {
    expect(validateBusinessRules(makeInvoice(), 0.01)).toEqual([]);
  });

  it('flags a subtotal that does not match the line items', () => {
    const invoice = makeInvoice({ subtotal: 1500 });
    const warnings = validateBusinessRules(invoice, 0.01);
    expect(warnings.some((w) => w.includes('subtotal'))).toBe(true);
  });

  it('flags a total that does not equal subtotal + tax', () => {
    const invoice = makeInvoice({ totalAmount: 9999 });
    const warnings = validateBusinessRules(invoice, 0.01);
    expect(warnings.some((w) => w.includes('total'))).toBe(true);
  });

  it('flags a line where quantity × unitPrice does not equal amount', () => {
    const invoice = makeInvoice({
      lineItems: [{ description: 'Widget', quantity: 2, unitPrice: 1000, amount: 1500 }],
      subtotal: 1500,
      taxAmount: 0,
      totalAmount: 1500,
    });
    const warnings = validateBusinessRules(invoice, 0.01);
    expect(warnings.some((w) => w.includes('Line 1'))).toBe(true);
  });

  it('absorbs sub-tolerance rounding noise', () => {
    const invoice = makeInvoice({ totalAmount: 2200.005 });
    expect(validateBusinessRules(invoice, 0.01)).toEqual([]);
  });
});

describe('buildFieldReviews', () => {
  it('marks fields below the threshold as needing review', () => {
    const reviews = buildFieldReviews({ a: 0.9, b: 0.4 }, 0.75);
    expect(reviews).toEqual([
      { field: 'a', confidence: 0.9, needsReview: false },
      { field: 'b', confidence: 0.4, needsReview: true },
    ]);
  });
});
