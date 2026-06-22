import { z } from 'zod';
import { ConfigError } from '../domain/errors/errors';

const DEFAULT_MAX_FILE_MB = 10;

/**
 * Validated application configuration. Parsing/validation lives here so the
 * rest of the app receives a fully-typed, already-checked config object and
 * never reads `process.env` directly.
 */
const ConfigSchema = z.object({
  anthropicApiKey: z.string().min(1, 'ANTHROPIC_API_KEY is required'),
  model: z.string().min(1).default('claude-sonnet-4-6'),
  maxFileBytes: z
    .number()
    .int()
    .positive()
    .default(DEFAULT_MAX_FILE_MB * 1024 * 1024),
  maxRetries: z.number().int().min(0).max(10).default(3),
  reviewThreshold: z.number().min(0).max(1).default(0.75),
  logLevel: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

/** Parse an env-shaped record into a typed config, or throw a clear ConfigError. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const maxFileMb = env.DOC_EXTRACT_MAX_FILE_MB;

  const parsed = ConfigSchema.safeParse({
    anthropicApiKey: env.ANTHROPIC_API_KEY,
    model: env.DOC_EXTRACT_MODEL,
    maxFileBytes: maxFileMb !== undefined ? Number(maxFileMb) * 1024 * 1024 : undefined,
    maxRetries: env.DOC_EXTRACT_MAX_RETRIES !== undefined ? Number(env.DOC_EXTRACT_MAX_RETRIES) : undefined,
    reviewThreshold:
      env.DOC_EXTRACT_REVIEW_THRESHOLD !== undefined
        ? Number(env.DOC_EXTRACT_REVIEW_THRESHOLD)
        : undefined,
    logLevel: env.LOG_LEVEL,
  });

  if (!parsed.success) {
    const issues = parsed.error.issues.map(
      (issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`,
    );
    throw new ConfigError('Invalid configuration.', {
      hint: 'Set the required environment variables (see .env.example).',
      context: { issues },
    });
  }

  return parsed.data;
}
