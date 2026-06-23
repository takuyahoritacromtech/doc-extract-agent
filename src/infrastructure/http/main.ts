import { loadConfig } from '../../config/config';
import { ExtractDocumentService } from '../../application/extract-document';
import { FsFileLoader } from '../files/file-loader';
import { AnthropicExtractor, AnthropicMessagesClient } from '../llm/anthropic-extractor';
import { createLogger } from '../logging/logger';
import { isDocExtractError } from '../../domain/errors/errors';
import { createExtractionServer } from './server';

/** Entry point for `doc-extract` HTTP server mode (`npm run serve`). */
function main(): void {
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

  const server = createExtractionServer({
    service,
    reviewThreshold: config.reviewThreshold,
    maxFileBytes: config.maxFileBytes,
    logger,
  });

  const port = Number(process.env.PORT ?? 3000);
  server.listen(port, () => {
    logger.info({ port }, 'doc-extract-agent HTTP server listening');
  });
}

try {
  main();
} catch (error) {
  const message = isDocExtractError(error) ? error.displayMessage : String(error);
  process.stderr.write(`\n✖ Failed to start server: ${message}\n`);
  process.exitCode = 1;
}
