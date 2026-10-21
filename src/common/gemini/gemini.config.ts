import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GeminiClient } from './gemini.client';

const DEFAULT_TIMEOUT_MS = 3000;

export function positiveInt(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

/**
 * Builds the Gemini client from the environment. Null when GEMINI_API_KEY is empty
 * (or set without GEMINI_MODEL), so no feature can send anything to Google.
 */
export function createGeminiClient(config: ConfigService): GeminiClient | null {
  const apiKey = config.get<string>('GEMINI_API_KEY')?.trim();
  if (!apiKey) return null;

  const model = config.get<string>('GEMINI_MODEL')?.trim();
  if (!model) {
    new Logger('GeminiConfig').error(
      'GEMINI_API_KEY is set but GEMINI_MODEL is empty; Gemini features are disabled',
    );
    return null;
  }

  const timeoutMs = positiveInt(
    config.get<string>('GEMINI_TIMEOUT_MS'),
    DEFAULT_TIMEOUT_MS,
  );
  return new GeminiClient(apiKey, model, timeoutMs);
}
