import type { ExtractionEnvelope, Invoice } from '../../src/domain/documents/invoice';

/** A self-consistent invoice (line items, subtotal, tax and total all reconcile). */
export function makeInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    vendorName: 'Acme Inc.',
    invoiceNumber: 'INV-001',
    issueDate: '2026-06-01',
    dueDate: '2026-06-30',
    currency: 'JPY',
    lineItems: [{ description: 'Widget', quantity: 2, unitPrice: 1000, amount: 2000 }],
    subtotal: 2000,
    taxAmount: 200,
    totalAmount: 2200,
    ...overrides,
  };
}

export function makeEnvelope(overrides: Partial<ExtractionEnvelope> = {}): ExtractionEnvelope {
  return {
    invoice: makeInvoice(),
    fieldConfidence: { vendorName: 0.98, invoiceNumber: 0.97, totalAmount: 0.95 },
    overallConfidence: 0.96,
    notes: null,
    ...overrides,
  };
}
