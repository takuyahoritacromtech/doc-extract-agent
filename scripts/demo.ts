/**
 * No-API-key demo.
 *
 * Wires the real ExtractDocumentService with a *stubbed* extractor that returns
 * a fixed sample envelope, so you can see the output shape and the
 * human-in-the-loop review UX without an Anthropic key or a real document.
 *
 * Run: `npm run demo`
 */
import {
  ExtractDocumentService,
  type DocumentExtractor,
  type FileLoader,
} from '../src/application/extract-document';
import type { LoadedDocument } from '../src/domain/documents/document';
import type { ExtractionEnvelope } from '../src/domain/documents/invoice';
import { toJson } from '../src/infrastructure/output/writers';

// A realistic, self-consistent invoice — except `dueDate`, which is intentionally
// low-confidence to demonstrate the per-field human-in-the-loop flagging.
const SAMPLE: ExtractionEnvelope = {
  invoice: {
    vendorName: 'Globex Corporation',
    invoiceNumber: 'GLX-2026-0042',
    issueDate: '2026-06-15',
    dueDate: '2026-07-15',
    currency: 'USD',
    lineItems: [
      { description: 'Cloud hosting (June)', quantity: 1, unitPrice: 480, amount: 480 },
      { description: 'Support hours', quantity: 6, unitPrice: 120, amount: 720 },
    ],
    subtotal: 1200,
    taxAmount: 120,
    totalAmount: 1320,
  },
  fieldConfidence: {
    vendorName: 0.99,
    invoiceNumber: 0.97,
    issueDate: 0.95,
    dueDate: 0.6,
    currency: 0.99,
    lineItems: 0.96,
    subtotal: 0.95,
    taxAmount: 0.94,
    totalAmount: 0.98,
  },
  overallConfidence: 0.93,
  notes: 'Due date was slightly blurred; please verify.',
};

const stubExtractor: DocumentExtractor = { extract: () => Promise.resolve(SAMPLE) };
const stubLoader: FileLoader = {
  load: (): Promise<LoadedDocument> =>
    Promise.resolve({ fileName: 'sample-invoice.png', mediaType: 'image/png', base64: '', sizeBytes: 0 }),
};

const service = new ExtractDocumentService({ fileLoader: stubLoader, extractor: stubExtractor });
const result = await service.run('sample-invoice.png', { reviewThreshold: 0.75 });

process.stdout.write('=== doc-extract-agent — SAMPLE output (mock LLM, no API call) ===\n');
process.stdout.write(`${toJson(result)}\n`);

if (result.needsReview) {
  process.stdout.write('\n⚠ Needs human review:\n');
  for (const warning of result.warnings) process.stdout.write(`  - ${warning}\n`);
  for (const field of result.fields.filter((f) => f.needsReview)) {
    process.stdout.write(`  - low confidence: ${field.field} (${Math.round(field.confidence * 100)}%)\n`);
  }
}
