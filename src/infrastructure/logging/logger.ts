import { pino } from 'pino';

/**
 * Minimal structural logger interface the app depends on. Keeping it small
 * means we are not coupled to pino and can swap it (or inject a no-op in tests).
 */
export interface Logger {
  debug(obj: object, msg?: string): void;
  info(obj: object, msg?: string): void;
  warn(obj: object, msg?: string): void;
  error(obj: object, msg?: string): void;
}

/**
 * Create a JSON logger with redaction of anything that could leak secrets or
 * document contents (PII). We never want an API key or a base64 document body
 * to land in logs.
 */
export function createLogger(level: string): Logger {
  return pino({
    level,
    redact: {
      paths: [
        'apiKey',
        '*.apiKey',
        'anthropicApiKey',
        '*.anthropicApiKey',
        'ANTHROPIC_API_KEY',
        'base64',
        '*.base64',
        'document.base64',
      ],
      censor: '[REDACTED]',
    },
  });
}

/** A logger that does nothing — handy as a default and in tests. */
export const nullLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};
