import { describe, expect, it, vi } from 'vitest';
import {
  AnthropicExtractor,
  mapLlmError,
  type LlmClient,
  type LlmExtractionRequest,
} from '../../src/infrastructure/llm/anthropic-extractor';
import {
  ErrorCode,
  ExtractionParseError,
  LlmError,
} from '../../src/domain/errors/errors';
import type { LoadedDocument } from '../../src/domain/documents/document';
import { makeEnvelope } from '../fixtures/invoices';

const doc: LoadedDocument = {
  fileName: 'invoice.png',
  mediaType: 'image/png',
  base64: 'AAAA',
  sizeBytes: 3,
};

/** A scripted LLM client: each call consumes the next step (last step repeats). */
class ScriptedLlmClient implements LlmClient {
  calls = 0;
  constructor(private readonly steps: Array<{ throw?: unknown; return?: unknown }>) {}
  requestExtraction(_request: LlmExtractionRequest): Promise<unknown> {
    const step = this.steps[Math.min(this.calls, this.steps.length - 1)]!;
    this.calls += 1;
    return step.throw !== undefined ? Promise.reject(step.throw) : Promise.resolve(step.return);
  }
}

const noSleep = (): Promise<void> => Promise.resolve();
const rateLimited = (): LlmError =>
  new LlmError(ErrorCode.LLM_RATE_LIMIT, 'rate limited', { retryable: true });

describe('AnthropicExtractor.extract', () => {
  it('returns a validated envelope on success', async () => {
    const envelope = makeEnvelope();
    const client = new ScriptedLlmClient([{ return: envelope }]);
    const extractor = new AnthropicExtractor(client, { model: 'm', maxRetries: 3, sleep: noSleep });

    await expect(extractor.extract(doc)).resolves.toEqual(envelope);
    expect(client.calls).toBe(1);
  });

  it('throws ExtractionParseError when the model output is malformed', async () => {
    const client = new ScriptedLlmClient([{ return: { not: 'an envelope' } }]);
    const extractor = new AnthropicExtractor(client, { model: 'm', maxRetries: 0, sleep: noSleep });

    const error = await extractor.extract(doc).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ExtractionParseError);
    expect((error as ExtractionParseError).issues.length).toBeGreaterThan(0);
  });

  it('retries transient errors with backoff, then succeeds', async () => {
    const client = new ScriptedLlmClient([
      { throw: rateLimited() },
      { throw: rateLimited() },
      { return: makeEnvelope() },
    ]);
    const sleep = vi.fn(noSleep);
    const extractor = new AnthropicExtractor(client, { model: 'm', maxRetries: 3, sleep });

    await expect(extractor.extract(doc)).resolves.toBeDefined();
    expect(client.calls).toBe(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('gives up after maxRetries and reports the attempt count', async () => {
    const client = new ScriptedLlmClient([{ throw: rateLimited() }]);
    const extractor = new AnthropicExtractor(client, { model: 'm', maxRetries: 2, sleep: noSleep });

    const error = await extractor.extract(doc).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LlmError);
    expect((error as LlmError).code).toBe(ErrorCode.LLM_RATE_LIMIT);
    expect((error as LlmError).attempts).toBe(3); // 1 initial + 2 retries
    expect(client.calls).toBe(3);
  });

  it('does not retry non-retryable errors', async () => {
    const authError = new LlmError(ErrorCode.LLM_AUTH, 'bad key', { retryable: false });
    const client = new ScriptedLlmClient([{ throw: authError }]);
    const extractor = new AnthropicExtractor(client, { model: 'm', maxRetries: 5, sleep: noSleep });

    await expect(extractor.extract(doc)).rejects.toMatchObject({ code: ErrorCode.LLM_AUTH });
    expect(client.calls).toBe(1);
  });
});

describe('mapLlmError', () => {
  it('maps HTTP statuses and connection errors to typed, retryable-aware errors', () => {
    expect(mapLlmError({ status: 401 })).toMatchObject({ code: ErrorCode.LLM_AUTH, retryable: false });
    expect(mapLlmError({ status: 429 })).toMatchObject({ code: ErrorCode.LLM_RATE_LIMIT, retryable: true });
    expect(mapLlmError({ status: 503 })).toMatchObject({ code: ErrorCode.LLM_SERVER, retryable: true });

    const timeout = new Error('socket hang up');
    timeout.name = 'APIConnectionTimeoutError';
    expect(mapLlmError(timeout)).toMatchObject({ code: ErrorCode.LLM_TIMEOUT, retryable: true });

    expect(mapLlmError(new Error('???'))).toMatchObject({ code: ErrorCode.LLM_UNKNOWN, retryable: false });
  });
});
