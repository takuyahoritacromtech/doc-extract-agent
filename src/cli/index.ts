#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
import { Command } from 'commander';
import { loadConfig } from '../config/config';
import { ExtractDocumentService } from '../application/extract-document';
import { FsFileLoader } from '../infrastructure/files/file-loader';
import {
  AnthropicExtractor,
  AnthropicMessagesClient,
} from '../infrastructure/llm/anthropic-extractor';
import { createLogger } from '../infrastructure/logging/logger';
import { toCsv, toJson } from '../infrastructure/output/writers';
import { isDocExtractError } from '../domain/errors/errors';
import type { ExtractionResult } from '../domain/extraction/result';

interface CliOptions {
  format: string;
  out?: string;
  strict?: boolean;
}

/** Compose the service from config. Kept separate so wiring is easy to read. */
function buildService(): { service: ExtractDocumentService; reviewThreshold: number } {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);
  const service = new ExtractDocumentService({
    fileLoader: new FsFileLoader({ maxFileBytes: config.maxFileBytes }),
    extractor: new AnthropicExtractor(AnthropicMessagesClient.fromApiKey(config.anthropicApiKey), {
      model: config.model,
      maxRetries: config.maxRetries,
      logger,
    }),
  });
  return { service, reviewThreshold: config.reviewThreshold };
}

/** Print a short, human-readable review summary to stderr (kept off stdout). */
function printReviewSummary(result: ExtractionResult): void {
  if (!result.needsReview) return;
  const lines = ['', '⚠ Needs human review:'];
  for (const warning of result.warnings) lines.push(`  - ${warning}`);
  for (const field of result.fields.filter((f) => f.needsReview)) {
    lines.push(`  - low confidence: ${field.field} (${Math.round(field.confidence * 100)}%)`);
  }
  process.stderr.write(`${lines.join('\n')}\n`);
}

const program = new Command();
program
  .name('doc-extract')
  .description('Extract structured data from invoices (PDF/image) using Claude.')
  .version('0.1.0')
  .argument('<file>', 'path to the document (.pdf, .png, .jpg, .jpeg, .webp)')
  .option('-f, --format <format>', 'output format: json | csv', 'json')
  .option('-o, --out <file>', 'write output to a file instead of stdout')
  .option('--strict', 'exit non-zero if the document fails business validation', false)
  .action(async (file: string, options: CliOptions) => {
    const { service, reviewThreshold } = buildService();
    const result = await service.run(file, {
      reviewThreshold,
      strict: Boolean(options.strict),
    });

    const output = options.format === 'csv' ? toCsv(result) : toJson(result);
    if (options.out) {
      await writeFile(options.out, `${output}\n`, 'utf8');
    } else {
      process.stdout.write(`${output}\n`);
    }
    printReviewSummary(result);
  });

async function main(): Promise<void> {
  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    if (isDocExtractError(error)) {
      process.stderr.write(`\n✖ ${error.displayMessage}\n`);
    } else {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`\n✖ Unexpected error: ${message}\n`);
    }
    process.exitCode = 1;
  }
}

void main();
