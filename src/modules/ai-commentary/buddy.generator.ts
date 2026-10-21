import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import type { GeminiClientPort } from '@/common/gemini/gemini.client';
import type { CommentSentiment } from '@/generated/prisma/client';
import {
  buildBuddyRequest,
  type BuddyContext,
  type BuddyTone,
} from './buddy.prompt';

export type BuddyOutcome =
  | { kind: 'comment'; sentiment: CommentSentiment; comment: string }
  /** A transient failure or an unusable answer: try again later. */
  | { kind: 'retry' }
  /** Nothing to do (feature off): do not try again. */
  | { kind: 'skip' };

const outputSchema = z.object({
  sentiment: z.enum(['ROAST', 'PRAISE', 'NUDGE']),
  comment: z.string().trim().min(1).max(200),
});

/**
 * The prompt forbids jokes about the body, but the model still slips now and then (belly fat,
 * acne, "sumo"). A small word list is the backstop: a hit counts as an unusable answer.
 */
const BODY_WORDS = [
  'bụng',
  'mỡ',
  'béo',
  'mập',
  'mụn',
  'gầy',
  'sumo',
  'cân nặng',
  'ú nu',
];

function mentionsBody(comment: string): boolean {
  const text = ` ${comment.toLowerCase().replace(/[^\p{L}\s]/gu, ' ')} `;
  return BODY_WORDS.some((word) => text.includes(` ${word} `));
}

@Injectable()
export class BuddyGenerator {
  private readonly logger = new Logger(BuddyGenerator.name);

  constructor(private readonly client: GeminiClientPort | null) {}

  get isEnabled(): boolean {
    return this.client !== null;
  }

  /** Never throws. The note and the comment are never logged. */
  async generate(ctx: BuddyContext, tone: BuddyTone): Promise<BuddyOutcome> {
    if (!this.client) return { kind: 'skip' };

    try {
      const raw = await this.client.generateJson(buildBuddyRequest(ctx, tone));
      const parsed = outputSchema.safeParse(raw);
      if (!parsed.success) {
        const problems = parsed.error.issues
          .map((issue) => `${issue.path.join('.') || '(root)'}:${issue.code}`)
          .join(', ');
        this.logger.warn(`Buddy output rejected: ${problems}`);
        return { kind: 'retry' };
      }
      if (tone === 'GENTLE' && parsed.data.sentiment === 'ROAST') {
        this.logger.warn('Buddy output rejected: ROAST in gentle mode');
        return { kind: 'retry' };
      }
      if (mentionsBody(parsed.data.comment)) {
        this.logger.warn('Buddy output rejected: body joke');
        return { kind: 'retry' };
      }
      return {
        kind: 'comment',
        sentiment: parsed.data.sentiment,
        comment: parsed.data.comment,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.warn(`Buddy call failed: ${message}`);
      return { kind: 'retry' };
    }
  }
}
