import { z } from 'zod';

/**
 * The invoice shape we ask the model to produce, expressed once in Zod.
 *
 * This single schema is the source of truth for:
 *  - the TypeScript types used across the app (`z.infer`),
 *  - the JSON Schema handed to the model as a tool definition
 *    (derived via Zod's built-in `z.toJSONSchema()` — no hand-maintained duplicate), and
 *  - runtime validation of whatever the model returns.
 *
 * Nullable (not optional) fields are used deliberately so the model always
 * emits every key — an explicit `null` is easier to reason about than a
 * missing property when reviewing low-confidence extractions.
 */

export const LineItemSchema = z.object({
  description: z.string(),
  quantity: z.number(),
  unitPrice: z.number(),
  amount: z.number(),
});
export type LineItem = z.infer<typeof LineItemSchema>;

export const InvoiceSchema = z.object({
  vendorName: z.string(),
  invoiceNumber: z.string(),
  issueDate: z.string().describe('ISO 8601 date, e.g. 2026-06-22'),
  dueDate: z.string().nullable().describe('ISO 8601 date, or null if not present'),
  currency: z.string().describe('ISO 4217 code, e.g. JPY, USD'),
  lineItems: z.array(LineItemSchema),
  subtotal: z.number().nullable(),
  taxAmount: z.number().nullable(),
  totalAmount: z.number(),
});
export type Invoice = z.infer<typeof InvoiceSchema>;

/**
 * What the model returns: the invoice plus calibrated confidence signals.
 * `fieldConfidence` lets the human-in-the-loop layer flag exactly which
 * fields to double-check rather than re-reviewing the whole document.
 */
export const ExtractionEnvelopeSchema = z.object({
  invoice: InvoiceSchema,
  fieldConfidence: z
    .record(z.string(), z.number().min(0).max(1))
    .describe('Confidence per top-level invoice field, 0..1'),
  overallConfidence: z.number().min(0).max(1),
  notes: z.string().nullable().describe('Anything ambiguous worth a human noting'),
});
export type ExtractionEnvelope = z.infer<typeof ExtractionEnvelopeSchema>;
