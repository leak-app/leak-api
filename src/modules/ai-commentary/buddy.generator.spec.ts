import { Logger } from '@nestjs/common';
import type { GeminiClientPort } from '@/common/gemini/gemini.client';
import { CommentSentiment } from '@/generated/prisma/client';
import { BuddyGenerator } from './buddy.generator';
import type { BuddyContext } from './buddy.prompt';

const ctx: BuddyContext = {
  amount: 55_000,
  categoryName: 'Ăn uống',
  description: 'Trà sữa bí mật',
  hourIct: 23,
  budgetUsedPercent: null,
  reasons: ['LATE_NIGHT'],
};

const clientReturning = (value: unknown): GeminiClientPort => ({
  generateJson: jest.fn().mockResolvedValue(value),
});

describe('BuddyGenerator', () => {
  afterEach(() => jest.restoreAllMocks());

  it('is disabled and skips without a client', async () => {
    const generator = new BuddyGenerator(null);
    expect(generator.isEnabled).toBe(false);
    await expect(generator.generate(ctx, 'SAVAGE')).resolves.toEqual({
      kind: 'skip',
    });
  });

  it('returns a validated, trimmed comment', async () => {
    const generator = new BuddyGenerator(
      clientReturning({
        sentiment: 'ROAST',
        comment: '  Lại trà sữa 11h đêm hả bro? 💀 ',
      }),
    );
    await expect(generator.generate(ctx, 'SAVAGE')).resolves.toEqual({
      kind: 'comment',
      sentiment: CommentSentiment.ROAST,
      comment: 'Lại trà sữa 11h đêm hả bro? 💀',
    });
  });

  it.each([
    ['an unknown sentiment', { sentiment: 'SHOUT', comment: 'x' }],
    ['an empty comment', { sentiment: 'NUDGE', comment: '   ' }],
    [
      'a 201-character comment',
      { sentiment: 'NUDGE', comment: 'a'.repeat(201) },
    ],
    ['a non-object', 'hello'],
  ])('retries on %s', async (_name, raw) => {
    const generator = new BuddyGenerator(clientReturning(raw));
    await expect(generator.generate(ctx, 'SAVAGE')).resolves.toEqual({
      kind: 'retry',
    });
  });

  it('retries, and does not throw, when the call fails', async () => {
    const client: GeminiClientPort = {
      generateJson: jest.fn().mockRejectedValue(new Error('timeout')),
    };
    await expect(
      new BuddyGenerator(client).generate(ctx, 'SAVAGE'),
    ).resolves.toEqual({
      kind: 'retry',
    });
  });

  it('retries when Gentle mode gets a ROAST back', async () => {
    const generator = new BuddyGenerator(
      clientReturning({ sentiment: 'ROAST', comment: 'Ôi trời' }),
    );
    await expect(generator.generate(ctx, 'GENTLE')).resolves.toEqual({
      kind: 'retry',
    });
  });

  it.each([
    'Bụng mỡ đến nơi rồi bro 🍔',
    'Ăn đêm thế này là mập lắm đó!',
    'Coi chừng mụn mọc đầy mặt nha',
    'Nuôi béo hả bro?',
  ])('retries when the comment jokes about the body: %s', async (comment) => {
    const generator = new BuddyGenerator(
      clientReturning({ sentiment: 'ROAST', comment }),
    );
    await expect(generator.generate(ctx, 'SAVAGE')).resolves.toEqual({
      kind: 'retry',
    });
  });

  it('does not log which body word was caught', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const generator = new BuddyGenerator(
      clientReturning({ sentiment: 'ROAST', comment: 'Bụng mỡ rồi bro' }),
    );
    await generator.generate(ctx, 'SAVAGE');
    expect(warn).toHaveBeenCalled();
    expect(JSON.stringify(warn.mock.calls)).not.toContain('mỡ');
  });

  it('never logs the note or the comment', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const generator = new BuddyGenerator(
      clientReturning({ sentiment: 'SHOUT', comment: 'Trà sữa bí mật' }),
    );
    await generator.generate(ctx, 'SAVAGE');
    expect(warn).toHaveBeenCalled();
    expect(JSON.stringify(warn.mock.calls)).not.toContain('bí mật');
  });
});
