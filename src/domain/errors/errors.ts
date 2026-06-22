/**
 * Typed error hierarchy.
 *
 * Design goals (why this exists):
 *  - Every failure mode has a stable, machine-readable `code` so callers can
 *    branch on it without string-matching messages.
 *  - Every error carries an actionable `hint` so an operator can fix the
 *    problem from the message alone (`displayMessage` renders `[CODE] msg Hint: ...`).
 *  - `retryable` lets the retry layer decide mechanically what to re-attempt.
 *  - `toJSON()` keeps structured logs clean and secret-free.
 */

export const ErrorCode = {
  CONFIG_INVALID: 'CONFIG_INVALID',
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  UNSUPPORTED_FILE_TYPE: 'UNSUPPORTED_FILE_TYPE',
  LLM_AUTH: 'LLM_AUTH',
  LLM_RATE_LIMIT: 'LLM_RATE_LIMIT',
  LLM_TIMEOUT: 'LLM_TIMEOUT',
  LLM_SERVER: 'LLM_SERVER',
  LLM_UNKNOWN: 'LLM_UNKNOWN',
  EXTRACTION_PARSE_FAILED: 'EXTRACTION_PARSE_FAILED',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface DocExtractErrorOptions {
  /** Human-actionable next step, shown to operators. */
  hint?: string;
  /** Whether the retry layer may re-attempt the operation. */
  retryable?: boolean;
  /** Structured, secret-free context for logs. */
  context?: Record<string, unknown>;
  /** Underlying cause (preserved via the standard Error `cause`). */
  cause?: unknown;
}

/** Base class for every error this library throws on purpose. */
export class DocExtractError extends Error {
  readonly code: ErrorCode;
  readonly hint: string | undefined;
  readonly retryable: boolean;
  readonly context: Record<string, unknown> | undefined;

  constructor(code: ErrorCode, message: string, options: DocExtractErrorOptions = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = new.target.name;
    this.code = code;
    this.hint = options.hint;
    this.retryable = options.retryable ?? false;
    this.context = options.context;
    // Keep `instanceof` working regardless of transpilation target.
    Object.setPrototypeOf(this, new.target.prototype);
  }

  /** Single-line, operator-friendly message: `[CODE] message Hint: ...`. */
  get displayMessage(): string {
    return this.hint
      ? `[${this.code}] ${this.message} Hint: ${this.hint}`
      : `[${this.code}] ${this.message}`;
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      hint: this.hint,
      retryable: this.retryable,
      context: this.context,
    };
  }
}

/** Invalid or missing configuration (e.g. no API key). */
export class ConfigError extends DocExtractError {
  constructor(message: string, options?: DocExtractErrorOptions) {
    super(ErrorCode.CONFIG_INVALID, message, options);
  }
}

export type FileErrorCode =
  | typeof ErrorCode.FILE_NOT_FOUND
  | typeof ErrorCode.FILE_TOO_LARGE
  | typeof ErrorCode.UNSUPPORTED_FILE_TYPE;

/** The input document could not be read or is not acceptable. */
export class FileError extends DocExtractError {
  constructor(code: FileErrorCode, message: string, options?: DocExtractErrorOptions) {
    super(code, message, options);
  }
}

export type LlmErrorCode =
  | typeof ErrorCode.LLM_AUTH
  | typeof ErrorCode.LLM_RATE_LIMIT
  | typeof ErrorCode.LLM_TIMEOUT
  | typeof ErrorCode.LLM_SERVER
  | typeof ErrorCode.LLM_UNKNOWN;

/** A failure talking to the LLM provider. `retryable` drives the retry loop. */
export class LlmError extends DocExtractError {
  /** How many attempts were made before giving up (set when retries are exhausted). */
  readonly attempts: number | undefined;

  constructor(
    code: LlmErrorCode,
    message: string,
    options?: DocExtractErrorOptions & { attempts?: number },
  ) {
    super(code, message, options);
    this.attempts = options?.attempts;
  }
}

/** The model replied but the output did not match the expected schema. */
export class ExtractionParseError extends DocExtractError {
  readonly issues: readonly string[];

  constructor(message: string, issues: readonly string[], options?: DocExtractErrorOptions) {
    super(ErrorCode.EXTRACTION_PARSE_FAILED, message, {
      ...options,
      context: { ...options?.context, issues },
    });
    this.issues = issues;
  }
}

/** Extraction succeeded structurally but failed a business rule (e.g. totals don't add up). */
export class ValidationError extends DocExtractError {
  readonly violations: readonly string[];

  constructor(message: string, violations: readonly string[], options?: DocExtractErrorOptions) {
    super(ErrorCode.VALIDATION_FAILED, message, {
      ...options,
      context: { ...options?.context, violations },
    });
    this.violations = violations;
  }
}

/** Narrowing helper for callers that catch `unknown`. */
export function isDocExtractError(error: unknown): error is DocExtractError {
  return error instanceof DocExtractError;
}
