import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CallLimiter } from './call-limiter';
import { GeminiClient } from './gemini.client';
import { GeminiParser } from './gemini.parser';

const DEFAULT_TIMEOUT_MS = 3000;
const DEFAULT_CALLS_PER_MINUTE = 10;

function positiveInt(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

/**
 * Builds the layer 2 parser from the environment. An empty GEMINI_API_KEY
 * switches it off: no client exists, so nothing can leave the server.
 */
export function createGeminiParser(config: ConfigService): GeminiParser {
  const logger = new Logger('GeminiConfig');
  const limiter = new CallLimiter(
    positiveInt(
      config.get<string>('GEMINI_CALLS_PER_MINUTE'),
      DEFAULT_CALLS_PER_MINUTE,
    ),
    60_000,
  );

  const apiKey = config.get<string>('GEMINI_API_KEY')?.trim();
  if (!apiKey) return new GeminiParser(null, limiter);

  const model = config.get<string>('GEMINI_MODEL')?.trim();
  if (!model) {
    logger.error(
      'GEMINI_API_KEY is set but GEMINI_MODEL is empty; Gemini fallback is disabled',
    );
    return new GeminiParser(null, limiter);
  }

  const timeoutMs = positiveInt(
    config.get<string>('GEMINI_TIMEOUT_MS'),
    DEFAULT_TIMEOUT_MS,
  );
  return new GeminiParser(new GeminiClient(apiKey, model, timeoutMs), limiter);
}
