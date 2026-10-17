import { Logger } from '@nestjs/common';
import { findAmounts } from './amount.parser';
import { mergeGemini } from './gemini.merge';
import type { GeminiResult } from './gemini.parser';
import { parseQuickLog } from './quick-log.parser';
import type { QuickLogContext, QuickLogDraft } from './quick-log.types';
import { fold } from './text';

/** The slice of `GeminiParser` that `resolveQuickLog` needs. */
export interface GeminiFallback {
  parse(
    userId: string,
    text: string,
    categories: { id: string; name: string }[],
  ): Promise<GeminiResult | null>;
}

const logger = new Logger('QuickLogResolve');

/**
 * Layer 1 first, instantly. Layer 2 (Gemini) is asked only for what layer 1
 * left open, and only the phrase and the category names leave the server.
 * Any layer 2 failure returns the layer 1 draft.
 */
export async function resolveQuickLog(
  userId: string,
  text: string,
  ctx: QuickLogContext,
  gemini: GeminiFallback,
): Promise<QuickLogDraft> {
  const draft = parseQuickLog(text, ctx);
  const amountCount = findAmounts(fold(text.normalize('NFC'))).length;
  if (!draft.unresolved.includes('category') && amountCount > 0) return draft;

  try {
    const result = await gemini.parse(
      userId,
      text,
      ctx.categories.map(({ id, name }) => ({ id, name })),
    );
    return result
      ? mergeGemini(draft, result, ctx.categories, amountCount)
      : draft;
  } catch (error) {
    logger.warn(
      `Gemini fallback failed: ${error instanceof Error ? error.message : 'unknown error'}`,
    );
    return draft;
  }
}
