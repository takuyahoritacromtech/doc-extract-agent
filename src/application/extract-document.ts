import type { LoadedDocument } from '../domain/documents/document';
import { InvoiceSchema, type ExtractionEnvelope } from '../domain/documents/invoice';
import type { ExtractionResult } from '../domain/extraction/result';
import { buildFieldReviews, validateBusinessRules } from '../domain/extraction/validate';
import { ValidationError } from '../domain/errors/errors';

/**
 * Ports (hexagonal architecture): the use case depends on these interfaces,
 * not on concrete adapters. Tests inject fakes; production injects the
 * filesystem loader and the Anthropic-backed extractor.
 */
export interface FileLoader {
  load(filePath: string): Promise<LoadedDocument>;
}

export interface DocumentExtractor {
  extract(document: LoadedDocument): Promise<ExtractionEnvelope>;
}

export interface ExtractOptions {
  /** Fields below this confidence (0..1) are flagged for human review. */
  reviewThreshold: number;
  /** When true, business-rule violations throw instead of becoming warnings. */
  strict?: boolean;
  /** Absolute tolerance for numeric reconciliation (defaults to 0.01). */
  tolerance?: number;
}

const DEFAULT_TOLERANCE = 0.01;

/**
 * Orchestrates one extraction end to end: load → extract → reconcile.
 *
 * It is pure orchestration with no I/O of its own, which keeps it fast and
 * deterministic to test. By default, business inconsistencies are surfaced as
 * `warnings` + `needsReview` (the extraction still succeeded and the data is
 * returned); `strict` flips them into a hard `ValidationError` for callers
 * that want a fail-closed pipeline.
 */
export class ExtractDocumentService {
  constructor(
    private readonly deps: {
      fileLoader: FileLoader;
      extractor: DocumentExtractor;
    },
  ) {}

  /** Load a document from a path, then extract. Used by the CLI. */
  async run(filePath: string, options: ExtractOptions): Promise<ExtractionResult> {
    const document = await this.deps.fileLoader.load(filePath);
    return this.runOnDocument(document, options);
  }

  /**
   * Extract from an already-loaded document. Used by the HTTP API, where bytes
   * arrive in the request rather than from the filesystem. Sharing this method
   * keeps CLI and server behaviour identical.
   */
  async runOnDocument(document: LoadedDocument, options: ExtractOptions): Promise<ExtractionResult> {
    const envelope = await this.deps.extractor.extract(document);

    const tolerance = options.tolerance ?? DEFAULT_TOLERANCE;
    const warnings = validateBusinessRules(envelope.invoice, tolerance);
    const fields = buildFieldReviews(
      envelope.fieldConfidence,
      options.reviewThreshold,
      Object.keys(InvoiceSchema.shape),
    );

    const needsReview =
      warnings.length > 0 ||
      envelope.overallConfidence < options.reviewThreshold ||
      fields.some((field) => field.needsReview);

    if (options.strict && warnings.length > 0) {
      throw new ValidationError('Document failed business validation in strict mode.', warnings, {
        hint: 'Re-run without --strict to receive the data with warnings instead of failing.',
        context: { fileName: document.fileName },
      });
    }

    return {
      invoice: envelope.invoice,
      overallConfidence: envelope.overallConfidence,
      fields,
      needsReview,
      warnings,
      notes: envelope.notes,
      source: {
        fileName: document.fileName,
        mediaType: document.mediaType,
        sizeBytes: document.sizeBytes,
      },
    };
  }
}
