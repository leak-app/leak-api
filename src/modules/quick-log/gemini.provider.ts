import { ConfigService } from '@nestjs/config';
import { createGeminiClient, positiveInt } from '@/common/gemini/gemini.config';
import { CallLimiter } from './call-limiter';
import { GeminiParser } from './gemini.parser';

const DEFAULT_CALLS_PER_MINUTE = 10;

/**
 * Builds the layer 2 parser from the environment. An empty GEMINI_API_KEY
 * switches it off: no client exists, so nothing can leave the server.
 */
export function createGeminiParser(config: ConfigService): GeminiParser {
  const limiter = new CallLimiter(
    positiveInt(
      config.get<string>('GEMINI_CALLS_PER_MINUTE'),
      DEFAULT_CALLS_PER_MINUTE,
    ),
    60_000,
  );
  return new GeminiParser(createGeminiClient(config), limiter);
}
