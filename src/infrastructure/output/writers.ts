import type { ExtractionResult } from '../../domain/extraction/result';

/** Pretty-printed JSON of the full result (invoice + review metadata). */
export function toJson(result: ExtractionResult): string {
  return JSON.stringify(result, null, 2);
}

/** Quote a CSV cell per RFC 4180 when it contains a comma, quote, or newline. */
function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Flatten the invoice to CSV: one row per line item with invoice-level fields
 * repeated, plus a `needsReview` column so downstream tools can route rows.
 */
export function toCsv(result: ExtractionResult): string {
  const { invoice } = result;
  const header = [
    'vendorName',
    'invoiceNumber',
    'issueDate',
    'dueDate',
    'currency',
    'lineDescription',
    'quantity',
    'unitPrice',
    'amount',
    'subtotal',
    'taxAmount',
    'totalAmount',
    'needsReview',
  ];

  const lineItems = invoice.lineItems.length > 0 ? invoice.lineItems : [null];
  const rows = lineItems.map((item) => [
    invoice.vendorName,
    invoice.invoiceNumber,
    invoice.issueDate,
    invoice.dueDate ?? '',
    invoice.currency,
    item?.description ?? '',
    item?.quantity ?? '',
    item?.unitPrice ?? '',
    item?.amount ?? '',
    invoice.subtotal ?? '',
    invoice.taxAmount ?? '',
    invoice.totalAmount,
    result.needsReview,
  ]);

  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
}
