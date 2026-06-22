import type { Invoice } from '../documents/invoice';
import type { SupportedMediaType } from '../documents/document';

/** Per-field review signal derived from the model's confidence and the threshold. */
export interface FieldReview {
  field: string;
  confidence: number;
  needsReview: boolean;
}

/**
 * The final, caller-facing result. It is intentionally richer than the raw
 * invoice: it tells the caller not just *what* was extracted but *how much to
 * trust it* and *what a human should look at* — the backbone of a
 * human-in-the-loop workflow.
 */
export interface ExtractionResult {
  invoice: Invoice;
  overallConfidence: number;
  fields: FieldReview[];
  /** True if any field is low-confidence or any business warning was raised. */
  needsReview: boolean;
  /** Non-fatal business-rule inconsistencies (e.g. totals that don't add up). */
  warnings: string[];
  notes: string | null;
  source: {
    fileName: string;
    mediaType: SupportedMediaType;
    sizeBytes: number;
  };
}
