import { describe, expect, it } from 'vitest';
import {
  DocExtractError,
  ErrorCode,
  ExtractionParseError,
  FileError,
  LlmError,
  ValidationError,
  isDocExtractError,
} from '../../src/domain/errors/errors';

describe('DocExtractError', () => {
  it('renders an operator-friendly displayMessage with code and hint', () => {
    const error = new FileError(ErrorCode.FILE_TOO_LARGE, 'Too big.', { hint: 'Shrink it.' });
    expect(error.displayMessage).toBe('[FILE_TOO_LARGE] Too big. Hint: Shrink it.');
  });

  it('omits the hint section when no hint is given', () => {
    const error = new LlmError(ErrorCode.LLM_UNKNOWN, 'Boom.');
    expect(error.displayMessage).toBe('[LLM_UNKNOWN] Boom.');
  });

  it('serialises to a secret-free, structured object', () => {
    const error = new LlmError(ErrorCode.LLM_RATE_LIMIT, 'Slow down.', {
      retryable: true,
      context: { attempt: 2 },
    });
    expect(error.toJSON()).toEqual({
      name: 'LlmError',
      code: 'LLM_RATE_LIMIT',
      message: 'Slow down.',
      hint: undefined,
      retryable: true,
      context: { attempt: 2 },
    });
  });

  it('keeps instanceof working across subclasses', () => {
    const error = new ValidationError('Bad totals.', ['x']);
    expect(error).toBeInstanceOf(DocExtractError);
    expect(error).toBeInstanceOf(ValidationError);
    expect(isDocExtractError(error)).toBe(true);
    expect(isDocExtractError(new Error('plain'))).toBe(false);
  });

  it('carries structured details on parse and validation errors', () => {
    const parse = new ExtractionParseError('Bad shape.', ['invoice.total: required']);
    expect(parse.issues).toEqual(['invoice.total: required']);
    expect(parse.context).toMatchObject({ issues: ['invoice.total: required'] });

    const validation = new ValidationError('Totals off.', ['sum mismatch']);
    expect(validation.violations).toEqual(['sum mismatch']);
  });

  it('preserves the underlying cause', () => {
    const cause = new Error('root');
    const error = new LlmError(ErrorCode.LLM_SERVER, 'Upstream.', { cause });
    expect(error.cause).toBe(cause);
  });
});
