import type { ExtractionResult } from '../../domain/extraction/result';

/** Pretty-printed JSON of the full result (invoice + review metadata). */
export function toJson(result: ExtractionResult): string {
  return JSON.stringify(result, null, 2);
}

/**
 * Render a CSV cell safely.
 *
 * Two concerns:
 *  1. RFC 4180 quoting when the value contains a comma, quote, or newline.
 *  2. CSV formula injection: extracted values are fully untrusted (they come
 *     from a document an attacker may control). A cell starting with `= + - @`
 *     or a tab/CR is treated as a formula by Excel/Sheets, so we prefix it with
 *     a single quote to neutralise it before quoting.
 */
function csvCell(value: unknown): string {
  const raw = value === null || value === undefined ? '' : String(value);
  const guarded = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return /[",\n]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
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
