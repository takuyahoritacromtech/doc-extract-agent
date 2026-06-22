import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config/config';
import { ConfigError } from '../../src/domain/errors/errors';

describe('loadConfig', () => {
  it('applies sensible defaults when only the API key is provided', () => {
    const config = loadConfig({ ANTHROPIC_API_KEY: 'sk-test' });
    expect(config).toMatchObject({
      anthropicApiKey: 'sk-test',
      model: 'claude-sonnet-4-6',
      maxFileBytes: 10 * 1024 * 1024,
      maxRetries: 3,
      reviewThreshold: 0.75,
      logLevel: 'info',
    });
  });

  it('reads and converts environment overrides', () => {
    const config = loadConfig({
      ANTHROPIC_API_KEY: 'sk-test',
      DOC_EXTRACT_MODEL: 'claude-opus-4-8',
      DOC_EXTRACT_MAX_FILE_MB: '5',
      DOC_EXTRACT_MAX_RETRIES: '1',
      DOC_EXTRACT_REVIEW_THRESHOLD: '0.5',
      LOG_LEVEL: 'debug',
    });
    expect(config.model).toBe('claude-opus-4-8');
    expect(config.maxFileBytes).toBe(5 * 1024 * 1024);
    expect(config.maxRetries).toBe(1);
    expect(config.reviewThreshold).toBe(0.5);
    expect(config.logLevel).toBe('debug');
  });

  it('throws a ConfigError when the API key is missing', () => {
    expect(() => loadConfig({})).toThrowError(ConfigError);
  });

  it('reports which fields were invalid in the error context', () => {
    try {
      loadConfig({ ANTHROPIC_API_KEY: 'sk-test', LOG_LEVEL: 'verbose' });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      const issues = (error as ConfigError).context?.issues as string[];
      expect(issues.join(' ')).toContain('logLevel');
    }
  });
});
