import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import type { DocumentExtractor } from '../../application/extract-document';
import type { LoadedDocument } from '../../domain/documents/document';
import {
  ExtractionEnvelopeSchema,
  type ExtractionEnvelope,
} from '../../domain/documents/invoice';
import {
  ErrorCode,
  ExtractionParseError,
  LlmError,
  type LlmErrorCode,
} from '../../domain/errors/errors';
import { nullLogger, type Logger } from '../logging/logger';

const TOOL_NAME = 'record_invoice';

const SYSTEM_PROMPT = [
  'You extract structured data from a single invoice document (image or PDF).',
  `Always call the "${TOOL_NAME}" tool exactly once with your best extraction.`,
  'Rules:',
  '- Use null for any field that is genuinely absent; do not invent values.',
  '- Dates must be ISO 8601 (YYYY-MM-DD). Currency must be an ISO 4217 code.',
  '- Numbers must be plain numbers without currency symbols or thousands separators.',
  '- For each top-level field, report a calibrated confidence in fieldConfidence (0..1).',
  '- Set overallConfidence to your overall confidence that the extraction is correct.',
].join('\n');

/**
 * Map any thrown error (typically an Anthropic SDK error) into a typed LlmError.
 *
 * Pure and SDK-agnostic: it inspects a duck-typed `status`/`name`, so it can be
 * unit-tested with plain fake errors and never needs a live API.
 */
export function mapLlmError(error: unknown): LlmError {
  const status =
    typeof error === 'object' && error !== null && 'status' in error
      ? Number((error as { status?: unknown }).status)
      : undefined;
  const name = error instanceof Error ? error.name : '';
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code)
    : '';

  if (status === 401 || status === 403) {
    return new LlmError(ErrorCode.LLM_AUTH, 'Authentication with the Anthropic API failed.', {
      hint: 'Verify ANTHROPIC_API_KEY is set and valid.',
      retryable: false,
      cause: error,
    });
  }
  if (status === 429) {
    return new LlmError(ErrorCode.LLM_RATE_LIMIT, 'Rate limited by the Anthropic API.', {
      hint: 'Lower request rate/concurrency; this request will be retried with backoff.',
      retryable: true,
      cause: error,
    });
  }
  if (status !== undefined && Number.isFinite(status) && status >= 500) {
    return new LlmError(ErrorCode.LLM_SERVER, `Anthropic API server error (status ${status}).`, {
      hint: 'Transient upstream issue; this request will be retried.',
      retryable: true,
      cause: error,
    });
  }
  if (/timeout|connection/i.test(name) || code === 'ETIMEDOUT' || code === 'ECONNRESET') {
    return new LlmError(ErrorCode.LLM_TIMEOUT, 'The Anthropic API request timed out or could not connect.', {
      hint: 'Check network connectivity; this request will be retried.',
      retryable: true,
      cause: error,
    });
  }
  return new LlmError(ErrorCode.LLM_UNKNOWN, 'Unexpected error calling the Anthropic API.', {
    retryable: false,
    cause: error,
  });
}

export interface LlmExtractionRequest {
  model: string;
  maxTokens: number;
  systemPrompt: string;
  document: LoadedDocument;
  toolName: string;
  toolDescription: string;
  inputSchema: Record<string, unknown>;
}

/**
 * Port for the raw LLM call. Returns the tool-input object the model produced
 * (unparsed). Implementations should throw an {@link LlmError} on API failure.
 */
export interface LlmClient {
  requestExtraction(request: LlmExtractionRequest): Promise<unknown>;
}

function buildDocumentBlock(document: LoadedDocument): Anthropic.ContentBlockParam {
  if (document.mediaType === 'application/pdf') {
    return {
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: document.base64 },
    };
  }
  return {
    type: 'image',
    source: { type: 'base64', media_type: document.mediaType, data: document.base64 },
  };
}

/** Adapter: the real Anthropic SDK behind the {@link LlmClient} port. */
export class AnthropicMessagesClient implements LlmClient {
  constructor(private readonly client: Anthropic) {}

  static fromApiKey(apiKey: string): AnthropicMessagesClient {
    return new AnthropicMessagesClient(new Anthropic({ apiKey }));
  }

  async requestExtraction(request: LlmExtractionRequest): Promise<unknown> {
    try {
      const message = await this.client.messages.create({
        model: request.model,
        max_tokens: request.maxTokens,
        system: request.systemPrompt,
        tools: [
          {
            name: request.toolName,
            description: request.toolDescription,
            input_schema: request.inputSchema as unknown as Anthropic.Tool.InputSchema,
          },
        ],
        tool_choice: { type: 'tool', name: request.toolName },
        messages: [
          {
            role: 'user',
            content: [
              buildDocumentBlock(request.document),
              { type: 'text', text: 'Extract the invoice using the provided tool.' },
            ],
          },
        ],
      });

      const toolUse = message.content.find((block) => block.type === 'tool_use');
      if (!toolUse || toolUse.type !== 'tool_use') {
        // No tool call came back; treat as transient so the retry layer re-asks.
        throw new LlmError(ErrorCode.LLM_UNKNOWN, 'The model did not return a tool result.', {
          hint: 'Retrying; if this persists the document may be unreadable.',
          retryable: true,
        });
      }
      return toolUse.input;
    } catch (error) {
      throw error instanceof LlmError ? error : mapLlmError(error);
    }
  }
}

export interface AnthropicExtractorOptions {
  model: string;
  /** Number of *re-tries* after the first attempt (so total attempts = maxRetries + 1). */
  maxRetries: number;
  maxTokens?: number;
  /** Injectable for tests so retries don't actually wait. */
  sleep?: (ms: number) => Promise<void>;
  logger?: Logger;
}

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Exponential backoff with jitter: 250ms, 500ms, 1s, ... capped at 8s. */
function backoffDelayMs(attempt: number): number {
  const base = Math.min(250 * 2 ** attempt, 8000);
  return base + Math.floor(Math.random() * 100);
}

function withAttempts(error: LlmError, attempts: number): LlmError {
  const cause = (error as { cause?: unknown }).cause;
  // Build options without explicit `undefined`, to satisfy exactOptionalPropertyTypes.
  return new LlmError(error.code as LlmErrorCode, `${error.message} (after ${attempts} attempt(s))`, {
    retryable: error.retryable,
    attempts,
    ...(error.hint !== undefined ? { hint: error.hint } : {}),
    ...(error.context !== undefined ? { context: error.context } : {}),
    ...(cause !== undefined ? { cause } : {}),
  });
}

/**
 * Turns a document into a validated {@link ExtractionEnvelope}.
 *
 * Responsibilities are split for testability:
 *  - retry/backoff around the {@link LlmClient} (transient failures only), and
 *  - strict runtime validation of the model output against the Zod schema.
 *
 * The tool's JSON Schema is derived from the same Zod schema (no duplication).
 */
export class AnthropicExtractor implements DocumentExtractor {
  private readonly inputSchema: Record<string, unknown>;
  private readonly logger: Logger;

  constructor(
    private readonly client: LlmClient,
    private readonly options: AnthropicExtractorOptions,
  ) {
    // Derive the tool's JSON Schema from the same Zod schema (single source of truth).
    this.inputSchema = z.toJSONSchema(ExtractionEnvelopeSchema) as Record<string, unknown>;
    this.logger = options.logger ?? nullLogger;
  }

  async extract(document: LoadedDocument): Promise<ExtractionEnvelope> {
    const raw = await this.requestWithRetry(document);

    const parsed = ExtractionEnvelopeSchema.safeParse(raw);
    if (!parsed.success) {
      const issues = parsed.error.issues.map(
        (issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`,
      );
      throw new ExtractionParseError(
        'The model output did not match the expected invoice schema.',
        issues,
        {
          hint: 'The document may be unclear or not an invoice. Try a higher-quality scan or page.',
          context: { fileName: document.fileName },
        },
      );
    }
    return parsed.data;
  }

  private async requestWithRetry(document: LoadedDocument): Promise<unknown> {
    const sleep = this.options.sleep ?? defaultSleep;
    const maxRetries = this.options.maxRetries;
    let lastError: LlmError | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.client.requestExtraction({
          model: this.options.model,
          maxTokens: this.options.maxTokens ?? 2048,
          systemPrompt: SYSTEM_PROMPT,
          document,
          toolName: TOOL_NAME,
          toolDescription: 'Record the structured invoice fields extracted from the document.',
          inputSchema: this.inputSchema,
        });
      } catch (error) {
        const llmError = error instanceof LlmError ? error : mapLlmError(error);
        lastError = llmError;

        const canRetry = llmError.retryable && attempt < maxRetries;
        if (!canRetry) {
          throw withAttempts(llmError, attempt + 1);
        }

        const delay = backoffDelayMs(attempt);
        this.logger.warn(
          { code: llmError.code, attempt: attempt + 1, nextDelayMs: delay },
          'Transient LLM error; retrying',
        );
        await sleep(delay);
      }
    }

    // Unreachable: the loop either returns or throws. Guards against future edits.
    throw lastError ?? new LlmError(ErrorCode.LLM_UNKNOWN, 'Extraction failed unexpectedly.');
  }
}
