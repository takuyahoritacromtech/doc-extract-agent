import type { Invoice } from '../documents/invoice';
import type { FieldReview } from './result';

/** Round to 2 decimals for stable, readable diffs in messages. */
function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Pure business-rule checks on an extracted invoice.
 *
 * These never throw — they return human-readable warnings. The caller decides
 * whether to treat them as fatal (strict mode) or as review hints. Keeping
 * this pure makes the rules trivially unit-testable and reusable.
 *
 * @param tolerance absolute numeric tolerance to absorb rounding noise.
 */
export function validateBusinessRules(invoice: Invoice, tolerance: number): string[] {
  const warnings: string[] = [];

  const lineSum = invoice.lineItems.reduce((sum, item) => sum + item.amount, 0);

  if (invoice.subtotal !== null && Math.abs(lineSum - invoice.subtotal) > tolerance) {
    warnings.push(
      `Line items sum to ${round(lineSum)} but subtotal is ${invoice.subtotal} ` +
        `(difference ${round(lineSum - invoice.subtotal)}).`,
    );
  }

  const base = invoice.subtotal ?? lineSum;
  const tax = invoice.taxAmount ?? 0;
  if (Math.abs(base + tax - invoice.totalAmount) > tolerance) {
    warnings.push(
      `subtotal (${base}) + tax (${tax}) = ${round(base + tax)} ` +
        `but total is ${invoice.totalAmount}.`,
    );
  }

  invoice.lineItems.forEach((item, index) => {
    const expected = item.quantity * item.unitPrice;
    if (Math.abs(expected - item.amount) > tolerance) {
      warnings.push(
        `Line ${index + 1} "${item.description}": ${item.quantity} × ${item.unitPrice} ` +
          `= ${round(expected)} but amount is ${item.amount}.`,
      );
    }
  });

  return warnings;
}

/** Map the model's per-field confidence into review flags against a threshold. */
export function buildFieldReviews(
  fieldConfidence: Record<string, number>,
  threshold: number,
): FieldReview[] {
  return Object.entries(fieldConfidence).map(([field, confidence]) => ({
    field,
    confidence,
    needsReview: confidence < threshold,
  }));
}
