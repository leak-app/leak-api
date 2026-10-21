import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/common/prisma.service';
import {
  AiCommentJobStatus,
  BuddyMode,
  CommentSentiment,
  Prisma,
  TransactionType,
} from '@/generated/prisma/client';
import { BuddyGenerator, type BuddyOutcome } from './buddy.generator';
import {
  averageOf,
  DEFAULT_DAILY_CAP,
  selectForComment,
} from './comment-selector';
import { ictDayStart, ictHour, ictMonthRange } from './ict';

export const BATCH_SIZE = 5;
/** Backoff after attempt 1, 2, 3 and 4 fails. */
export const RETRY_DELAYS_MS = [60_000, 300_000, 1_800_000, 7_200_000] as const;
export const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;
/** A job this old is dropped instead of commenting on something the user has long forgotten. */
export const JOB_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const HISTORY_SIZE = 20;
/** A transaction typed in within this long of when it happened counts as logged live. */
const LIVE_ENTRY_MS = 10 * 60 * 1000;

type DueJob = Prisma.AiCommentJobGetPayload<{
  include: { transaction: { include: { category: true } } };
}>;

export interface BuddyReactionView {
  status: 'NONE' | AiCommentJobStatus;
  comment: string | null;
  sentiment: CommentSentiment | null;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}

@Injectable()
export class AiCommentaryService {
  private readonly _logger = new Logger(AiCommentaryService.name);

  constructor(
    private readonly _prisma: PrismaService,
    private readonly _generator: BuddyGenerator,
  ) {}

  get isEnabled(): boolean {
    return this._generator.isEnabled;
  }

  /**
   * Queues the "maybe comment" decision for a saved expense. One plain insert, so saving
   * never waits on AI. Never throws: a Buddy problem must not break logging a spend.
   */
  async enqueue(transaction: {
    id: string;
    userId: string;
    type: TransactionType;
  }): Promise<void> {
    if (!this.isEnabled || transaction.type !== TransactionType.EXPENSE) return;
    try {
      await this._prisma.aiCommentJob.create({
        data: { transactionId: transaction.id, userId: transaction.userId },
      });
    } catch (error) {
      this._logger.warn(
        `Could not queue a buddy comment: ${describeError(error)}`,
      );
    }
  }

  /** Handles one small batch of due jobs. Returns how many it looked at. */
  async processDue(now: Date = new Date()): Promise<number> {
    if (!this.isEnabled) return 0;

    const jobs = await this._prisma.aiCommentJob.findMany({
      where: {
        status: AiCommentJobStatus.PENDING,
        nextAttemptAt: { lte: now },
      },
      orderBy: { nextAttemptAt: 'asc' },
      take: BATCH_SIZE,
      include: { transaction: { include: { category: true } } },
    });

    // One at a time: one user's slow answer never bursts the model quota.
    for (const job of jobs) {
      try {
        await this._processJob(job, now);
      } catch (error) {
        this._logger.error(
          `Buddy job ${job.id} crashed: ${describeError(error)}`,
        );
        await this._retryLater(job, now).catch(() => undefined);
      }
    }
    return jobs.length;
  }

  /** What the app needs after a save: is the comment ready, still coming, or never coming. */
  async findForTransaction(
    userId: string,
    transactionId: string,
  ): Promise<BuddyReactionView> {
    const job = await this._prisma.aiCommentJob.findFirst({
      where: { transactionId, userId },
      select: {
        status: true,
        transaction: { select: { aiComment: true, aiSentiment: true } },
      },
    });
    if (!job) return { status: 'NONE', comment: null, sentiment: null };
    return {
      status: job.status,
      comment: job.transaction.aiComment,
      sentiment: job.transaction.aiSentiment,
    };
  }

  /** Drops finished jobs after a week; pending ones are never touched. */
  async purgeFinished(now: Date = new Date()): Promise<number> {
    const { count } = await this._prisma.aiCommentJob.deleteMany({
      where: {
        status: { not: AiCommentJobStatus.PENDING },
        updatedAt: { lt: new Date(now.getTime() - RETENTION_MS) },
      },
    });
    return count;
  }

  private async _processJob(job: DueJob, now: Date): Promise<void> {
    const tx = job.transaction;
    if (
      now.getTime() - job.createdAt.getTime() > JOB_MAX_AGE_MS ||
      tx.isDeleted ||
      tx.type !== TransactionType.EXPENSE
    ) {
      return this._finish(job.id, AiCommentJobStatus.SKIPPED);
    }

    // The mode is read now, not when the job was queued: muting stops what is already waiting.
    const user = await this._prisma.user.findUnique({
      where: { id: job.userId },
      select: { buddyMode: true },
    });
    if (!user || user.buddyMode === BuddyMode.MUTE) {
      return this._finish(job.id, AiCommentJobStatus.SKIPPED);
    }

    const { start, month, year } = ictMonthRange(tx.createdAt);
    const [budget, spent, history, commentsToday] = await Promise.all([
      this._prisma.budget.findUnique({
        where: {
          userId_categoryId_month_year: {
            userId: job.userId,
            categoryId: tx.categoryId,
            month,
            year,
          },
        },
        select: { amount: true },
      }),
      this._prisma.transaction.aggregate({
        where: {
          userId: job.userId,
          categoryId: tx.categoryId,
          type: TransactionType.EXPENSE,
          isDeleted: false,
          createdAt: { gte: start, lte: tx.createdAt },
        },
        _sum: { amount: true },
      }),
      this._prisma.transaction.findMany({
        where: {
          userId: job.userId,
          categoryId: tx.categoryId,
          type: TransactionType.EXPENSE,
          isDeleted: false,
          id: { not: tx.id },
        },
        orderBy: { createdAt: 'desc' },
        take: HISTORY_SIZE,
        select: { amount: true },
      }),
      this._prisma.aiCommentJob.count({
        where: {
          userId: job.userId,
          status: AiCommentJobStatus.DONE,
          updatedAt: { gte: ictDayStart(now) },
        },
      }),
    ]);

    const amount = Number(tx.amount);
    const budgetAmount = budget ? Number(budget.amount) : 0;
    const monthSpent = Number(spent._sum.amount ?? 0);
    const hourIct = ictHour(tx.createdAt);

    const reasons = selectForComment({
      type: tx.type,
      categoryType: tx.category.type,
      amount,
      hourIct,
      enteredLive:
        Math.abs(job.createdAt.getTime() - tx.createdAt.getTime()) <
        LIVE_ENTRY_MS,
      budgetAmount,
      monthSpent,
      categoryAverage: averageOf(history.map((row) => Number(row.amount))),
      commentsToday,
      dailyCap: DEFAULT_DAILY_CAP,
      mode: user.buddyMode,
    });
    if (!reasons) return this._finish(job.id, AiCommentJobStatus.SKIPPED);

    const outcome = await this._generator.generate(
      {
        amount,
        categoryName: tx.category.name,
        description: tx.description,
        hourIct,
        budgetUsedPercent:
          budgetAmount > 0
            ? Math.round((monthSpent / budgetAmount) * 100)
            : null,
        reasons,
      },
      user.buddyMode === BuddyMode.GENTLE ? 'GENTLE' : 'SAVAGE',
    );
    return this._applyOutcome(job, outcome, now);
  }

  private async _applyOutcome(
    job: DueJob,
    outcome: BuddyOutcome,
    now: Date,
  ): Promise<void> {
    if (outcome.kind === 'skip') {
      return this._finish(job.id, AiCommentJobStatus.SKIPPED);
    }
    if (outcome.kind === 'retry') return this._retryLater(job, now);

    // Guarded by updatedAt: an edit made while the model was answering invalidates the comment.
    const written = await this._prisma.transaction.updateMany({
      where: {
        id: job.transaction.id,
        updatedAt: job.transaction.updatedAt,
        isDeleted: false,
      },
      data: { aiComment: outcome.comment, aiSentiment: outcome.sentiment },
    });
    return this._finish(
      job.id,
      written.count === 1
        ? AiCommentJobStatus.DONE
        : AiCommentJobStatus.SKIPPED,
    );
  }

  private async _finish(id: string, status: AiCommentJobStatus): Promise<void> {
    await this._prisma.aiCommentJob.update({ where: { id }, data: { status } });
  }

  private async _retryLater(job: DueJob, now: Date): Promise<void> {
    const attempts = job.attempts + 1;
    await this._prisma.aiCommentJob.update({
      where: { id: job.id },
      data:
        attempts >= MAX_ATTEMPTS
          ? { status: AiCommentJobStatus.FAILED, attempts }
          : {
              attempts,
              nextAttemptAt: new Date(
                now.getTime() + RETRY_DELAYS_MS[attempts - 1],
              ),
            },
    });
  }
}
