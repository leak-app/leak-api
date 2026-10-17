import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { CallLimiter } from './call-limiter';
import type { GeminiClientPort } from './gemini.client';
import { buildGeminiRequest, NO_CATEGORY } from './gemini.request';

export interface GeminiResult {
  amount: number | null;
  type: 'EXPENSE' | 'INCOME';
  categoryId: string | null;
}

const outputSchema = z.object({
  amount: z.number().int().min(1).max(999_999_999).nullable(),
  type: z.enum(['expense', 'income']),
  category: z.string(),
});

@Injectable()
export class GeminiParser {
  private readonly logger = new Logger(GeminiParser.name);

  constructor(
    private readonly client: GeminiClientPort | null,
    private readonly limiter: CallLimiter,
  ) {}

  /**
   * Null when disabled, over the limit, or on any failure. Never throws.
   * Neither the phrase nor the model output is ever logged.
   */
  async parse(
    userId: string,
    text: string,
    categories: { id: string; name: string }[],
  ): Promise<GeminiResult | null> {
    if (!this.client) return null;
    if (!this.limiter.tryAcquire(userId)) {
      this.logger.warn('Gemini call skipped: per-user rate limit reached');
      return null;
    }

    try {
      const request = buildGeminiRequest(
        text,
        categories.map((category) => category.name),
      );
      const raw = await this.client.generateJson(request);

      const parsed = outputSchema.safeParse(raw);
      if (!parsed.success) {
        const problems = parsed.error.issues
          .map((issue) => `${issue.path.join('.') || '(root)'}:${issue.code}`)
          .join(', ');
        this.logger.warn(`Gemini output rejected: ${problems}`);
        return null;
      }

      return {
        amount: parsed.data.amount,
        type: parsed.data.type === 'income' ? 'INCOME' : 'EXPENSE',
        categoryId: this.resolveCategoryId(parsed.data.category, categories),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.warn(`Gemini call failed: ${message}`);
      return null;
    }
  }

  /** Exact name match; a marker, unknown or shared name never becomes an id. */
  private resolveCategoryId(
    name: string,
    categories: { id: string; name: string }[],
  ): string | null {
    if (name === NO_CATEGORY) return null;
    const matches = categories.filter((category) => category.name === name);
    return matches.length === 1 ? matches[0].id : null;
  }
}
