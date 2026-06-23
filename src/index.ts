/**
 * Public library API.
 *
 * Import the service and wire your own adapters, or reuse the provided
 * filesystem loader and Anthropic extractor:
 *
 * ```ts
 * import {
 *   ExtractDocumentService,
 *   FsFileLoader,
 *   AnthropicExtractor,
 *   AnthropicMessagesClient,
 *   loadConfig,
 * } from 'doc-extract-agent';
 *
 * const config = loadConfig();
 * const service = new ExtractDocumentService({
 *   fileLoader: new FsFileLoader({ maxFileBytes: config.maxFileBytes }),
 *   extractor: new AnthropicExtractor(
 *     AnthropicMessagesClient.fromApiKey(config.anthropicApiKey),
 *     { model: config.model, maxRetries: config.maxRetries },
 *   ),
 * });
 * const result = await service.run('invoice.pdf', { reviewThreshold: 0.75 });
 * ```
 */

// Domain
export * from './domain/errors/errors';
export * from './domain/documents/document';
export * from './domain/documents/invoice';
export * from './domain/extraction/result';
export * from './domain/extraction/validate';

// Application (use case + ports)
export * from './application/extract-document';

// Infrastructure (adapters)
export * from './infrastructure/files/file-loader';
export * from './infrastructure/llm/anthropic-extractor';
export * from './infrastructure/output/writers';
export * from './infrastructure/logging/logger';
export * from './infrastructure/http/server';

// Config
export { loadConfig, type AppConfig } from './config/config';
