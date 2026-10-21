import type { PrismaService } from '@/common/prisma.service';
import {
  AiCommentJobStatus,
  BuddyMode,
  CategoryType,
  CommentSentiment,
  Prisma,
  TransactionType,
} from '@/generated/prisma/client';
import {
  AiCommentaryService,
  BATCH_SIZE,
  JOB_MAX_AGE_MS,
} from './ai-commentary.service';
import type { BuddyGenerator } from './buddy.generator';

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */

const userId = 'user-1';
const lateNight = new Date('2026-10-20T16:30:00Z'); // 23:30 in Vietnam
const lunchTime = new Date('2026-10-20T05:00:00Z'); // 12:00 in Vietnam
const now = new Date('2026-10-20T16:30:05Z');

function createPrismaMock() {
  return {
    aiCommentJob: {
      create: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
      count: jest.fn().mockResolvedValue(0),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({ buddyMode: BuddyMode.SAVAGE }),
    },
    budget: { findUnique: jest.fn().mockResolvedValue(null) },
    transaction: {
      aggregate: jest
        .fn()
        .mockResolvedValue({ _sum: { amount: new Prisma.Decimal(55000) } }),
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
}

function makeJob(
  job: Record<string, unknown> = {},
  tx: Record<string, unknown> = {},
  at: Date = lateNight,
) {
  return {
    id: 'job1',
    transactionId: 't1',
    userId,
    status: AiCommentJobStatus.PENDING,
    attempts: 0,
    nextAttemptAt: at,
    createdAt: at,
    updatedAt: at,
    transaction: {
      id: 't1',
      userId,
      categoryId: 'c1',
      type: TransactionType.EXPENSE,
      amount: new Prisma.Decimal(55000),
      description: 'Trà sữa',
      isDeleted: false,
      createdAt: at,
      updatedAt: at,
      category: { id: 'c1', name: 'Ăn uống', type: CategoryType.EXPENSE },
      ...tx,
    },
    ...job,
  };
}

describe('AiCommentaryService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let generator: { isEnabled: boolean; generate: jest.Mock };
  let service: AiCommentaryService;

  const statusOf = (callIndex = 0) =>
    prisma.aiCommentJob.update.mock.calls[callIndex][0].data;

  beforeEach(() => {
    prisma = createPrismaMock();
    generator = {
      isEnabled: true,
      generate: jest.fn().mockResolvedValue({
        kind: 'comment',
        sentiment: CommentSentiment.ROAST,
        comment: 'Lại trà sữa 11h đêm hả bro? 💀',
      }),
    };
    service = new AiCommentaryService(
      prisma as unknown as PrismaService,
      generator as unknown as BuddyGenerator,
    );
  });

  describe('enqueue', () => {
    const expense = { id: 't1', userId, type: TransactionType.EXPENSE };

    it('queues an expense', async () => {
      await service.enqueue(expense);
      expect(prisma.aiCommentJob.create).toHaveBeenCalledWith({
        data: { transactionId: 't1', userId },
      });
    });

    it('does not queue income', async () => {
      await service.enqueue({ ...expense, type: TransactionType.INCOME });
      expect(prisma.aiCommentJob.create).not.toHaveBeenCalled();
    });

    it('does not queue anything while the Buddy is off', async () => {
      generator.isEnabled = false;
      await service.enqueue(expense);
      expect(prisma.aiCommentJob.create).not.toHaveBeenCalled();
    });

    it('never throws, so saving a transaction cannot fail because of it', async () => {
      prisma.aiCommentJob.create.mockRejectedValue(new Error('db down'));
      await expect(service.enqueue(expense)).resolves.toBeUndefined();
    });
  });

  describe('processDue', () => {
    it('does nothing while the Buddy is off', async () => {
      generator.isEnabled = false;
      await expect(service.processDue(now)).resolves.toBe(0);
      expect(prisma.aiCommentJob.findMany).not.toHaveBeenCalled();
    });

    it('takes only due, pending jobs, oldest first, one small batch at a time', async () => {
      await service.processDue(now);
      expect(prisma.aiCommentJob.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            status: AiCommentJobStatus.PENDING,
            nextAttemptAt: { lte: now },
          },
          orderBy: { nextAttemptAt: 'asc' },
          take: BATCH_SIZE,
        }),
      );
    });

    it('writes the comment and marks the job done when a spend is picked', async () => {
      prisma.aiCommentJob.findMany.mockResolvedValue([makeJob()]);

      await expect(service.processDue(now)).resolves.toBe(1);

      expect(generator.generate).toHaveBeenCalledWith(
        {
          amount: 55000,
          categoryName: 'Ăn uống',
          description: 'Trà sữa',
          hourIct: 23,
          budgetUsedPercent: null,
          reasons: ['LATE_NIGHT'],
        },
        'SAVAGE',
      );
      expect(prisma.transaction.updateMany).toHaveBeenCalledWith({
        where: { id: 't1', updatedAt: lateNight, isDeleted: false },
        data: {
          aiComment: 'Lại trà sữa 11h đêm hả bro? 💀',
          aiSentiment: CommentSentiment.ROAST,
        },
      });
      expect(prisma.aiCommentJob.update).toHaveBeenCalledWith({
        where: { id: 'job1' },
        data: { status: AiCommentJobStatus.DONE },
      });
    });

    it('computes the budget percent and an over-budget reason', async () => {
      prisma.budget.findUnique.mockResolvedValue({
        amount: new Prisma.Decimal(1_000_000),
      });
      prisma.transaction.aggregate.mockResolvedValue({
        _sum: { amount: new Prisma.Decimal(1_020_000) },
      });
      prisma.aiCommentJob.findMany.mockResolvedValue([
        makeJob({ createdAt: lunchTime }, { createdAt: lunchTime }),
      ]);

      await service.processDue(now);

      const [context] = generator.generate.mock.calls[0];
      expect(context.reasons).toEqual(['OVER_BUDGET']);
      expect(context.budgetUsedPercent).toBe(102);
    });

    it('skips an ordinary spend without calling the model', async () => {
      prisma.aiCommentJob.findMany.mockResolvedValue([
        makeJob({ createdAt: lunchTime }, { createdAt: lunchTime }),
      ]);

      await service.processDue(now);

      expect(generator.generate).not.toHaveBeenCalled();
      expect(statusOf()).toEqual({ status: AiCommentJobStatus.SKIPPED });
    });

    it('does not treat a backdated night-time entry as late-night', async () => {
      // Typed at 23:30 for a transaction dated three days ago.
      const backdated = new Date('2026-10-17T16:30:00Z');
      prisma.aiCommentJob.findMany.mockResolvedValue([
        makeJob({ createdAt: lateNight }, { createdAt: backdated }),
      ]);

      await service.processDue(now);

      expect(generator.generate).not.toHaveBeenCalled();
      expect(statusOf()).toEqual({ status: AiCommentJobStatus.SKIPPED });
    });

    it('skips a job older than 24 hours without even loading the user', async () => {
      const old = new Date(now.getTime() - JOB_MAX_AGE_MS - 1000);
      prisma.aiCommentJob.findMany.mockResolvedValue([
        makeJob({ createdAt: old }),
      ]);

      await service.processDue(now);

      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(statusOf()).toEqual({ status: AiCommentJobStatus.SKIPPED });
    });

    it('skips a transaction that was deleted before the worker got to it', async () => {
      prisma.aiCommentJob.findMany.mockResolvedValue([
        makeJob({}, { isDeleted: true }),
      ]);
      await service.processDue(now);
      expect(generator.generate).not.toHaveBeenCalled();
      expect(statusOf()).toEqual({ status: AiCommentJobStatus.SKIPPED });
    });

    it('reads the mode when the job runs: a user who muted since is skipped', async () => {
      prisma.user.findUnique.mockResolvedValue({ buddyMode: BuddyMode.MUTE });
      prisma.aiCommentJob.findMany.mockResolvedValue([makeJob()]);

      await service.processDue(now);

      expect(generator.generate).not.toHaveBeenCalled();
      expect(prisma.transaction.aggregate).not.toHaveBeenCalled();
      expect(statusOf()).toEqual({ status: AiCommentJobStatus.SKIPPED });
    });

    it('asks for the gentle tone for a gentle user', async () => {
      prisma.user.findUnique.mockResolvedValue({ buddyMode: BuddyMode.GENTLE });
      prisma.aiCommentJob.findMany.mockResolvedValue([makeJob()]);

      await service.processDue(now);

      expect(generator.generate.mock.calls[0][1]).toBe('GENTLE');
    });

    it('stops at the daily cap', async () => {
      prisma.aiCommentJob.count.mockResolvedValue(3);
      prisma.aiCommentJob.findMany.mockResolvedValue([makeJob()]);

      await service.processDue(now);

      expect(generator.generate).not.toHaveBeenCalled();
      expect(statusOf()).toEqual({ status: AiCommentJobStatus.SKIPPED });
    });

    it('discards a comment when the transaction was edited while the model was answering', async () => {
      prisma.transaction.updateMany.mockResolvedValue({ count: 0 });
      prisma.aiCommentJob.findMany.mockResolvedValue([makeJob()]);

      await service.processDue(now);

      expect(statusOf()).toEqual({ status: AiCommentJobStatus.SKIPPED });
    });

    it('retries with backoff when the model fails', async () => {
      generator.generate.mockResolvedValue({ kind: 'retry' });
      prisma.aiCommentJob.findMany.mockResolvedValue([makeJob()]);

      await service.processDue(now);

      expect(statusOf()).toEqual({
        attempts: 1,
        nextAttemptAt: new Date(now.getTime() + 60_000),
      });
    });

    it('grows the delay and gives up after the last attempt', async () => {
      generator.generate.mockResolvedValue({ kind: 'retry' });
      prisma.aiCommentJob.findMany.mockResolvedValue([
        makeJob({ attempts: 2 }),
        makeJob({ id: 'job2', attempts: 4 }),
      ]);

      await service.processDue(now);

      expect(statusOf(0)).toEqual({
        attempts: 3,
        nextAttemptAt: new Date(now.getTime() + 1_800_000),
      });
      expect(statusOf(1)).toEqual({
        status: AiCommentJobStatus.FAILED,
        attempts: 5,
      });
    });

    it('treats an unexpected error as a failed attempt and still processes the next job', async () => {
      prisma.user.findUnique
        .mockRejectedValueOnce(new Error('db hiccup'))
        .mockResolvedValue({ buddyMode: BuddyMode.SAVAGE });
      prisma.aiCommentJob.findMany.mockResolvedValue([
        makeJob(),
        makeJob({ id: 'job2', transactionId: 't2' }, { id: 't2' }),
      ]);

      await expect(service.processDue(now)).resolves.toBe(2);

      expect(statusOf(0)).toEqual({
        attempts: 1,
        nextAttemptAt: new Date(now.getTime() + 60_000),
      });
      expect(generator.generate).toHaveBeenCalledTimes(1);
    });
  });

  describe('findForTransaction', () => {
    it('is NONE when no job exists for the caller', async () => {
      await expect(service.findForTransaction(userId, 't1')).resolves.toEqual({
        status: 'NONE',
        comment: null,
        sentiment: null,
      });
      expect(prisma.aiCommentJob.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { transactionId: 't1', userId } }),
      );
    });

    it('returns the comment of a finished job', async () => {
      prisma.aiCommentJob.findFirst.mockResolvedValue({
        status: AiCommentJobStatus.DONE,
        transaction: {
          aiComment: 'Xịn đó bro 🔥',
          aiSentiment: CommentSentiment.PRAISE,
        },
      });
      await expect(service.findForTransaction(userId, 't1')).resolves.toEqual({
        status: AiCommentJobStatus.DONE,
        comment: 'Xịn đó bro 🔥',
        sentiment: CommentSentiment.PRAISE,
      });
    });

    it('hides a comment that was cleared by an edit', async () => {
      prisma.aiCommentJob.findFirst.mockResolvedValue({
        status: AiCommentJobStatus.DONE,
        transaction: { aiComment: null, aiSentiment: null },
      });
      await expect(service.findForTransaction(userId, 't1')).resolves.toEqual({
        status: AiCommentJobStatus.DONE,
        comment: null,
        sentiment: null,
      });
    });

    it('reports a pending job without a comment', async () => {
      prisma.aiCommentJob.findFirst.mockResolvedValue({
        status: AiCommentJobStatus.PENDING,
        transaction: { aiComment: null, aiSentiment: null },
      });
      const view = await service.findForTransaction(userId, 't1');
      expect(view.status).toBe(AiCommentJobStatus.PENDING);
    });
  });

  describe('purgeFinished', () => {
    it('deletes only finished jobs older than a week', async () => {
      prisma.aiCommentJob.deleteMany.mockResolvedValue({ count: 4 });

      await expect(service.purgeFinished(now)).resolves.toBe(4);

      expect(prisma.aiCommentJob.deleteMany).toHaveBeenCalledWith({
        where: {
          status: { not: AiCommentJobStatus.PENDING },
          updatedAt: { lt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) },
        },
      });
    });
  });
});
