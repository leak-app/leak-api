import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '@/common/prisma.service';
import {
  GoalContributionSource,
  GoalContributionType,
  LeakReclaim,
  LeakReclaimStatus,
  Prisma,
  TransactionType,
} from '@/generated/prisma/client';
import { GoalService } from '@/modules/goals/goals.service';
import { TransferReclaimDto } from './dto/reclaim.dto';
import {
  bucketByMonth,
  computeReclaim,
  lastMonths,
  monthBounds,
  reclaimMonths,
  type IneligibleReason,
  type MonthKey,
  type ReclaimResult,
} from './reclaim.calculator';

export type ReclaimOfferView = {
  year: number;
  month: number;
  status: 'OPEN' | 'TRANSFERRED' | 'DISMISSED' | 'INELIGIBLE';
  reason: IneligibleReason | null;
  reclaimableAmount: number;
  coverage: number | null;
  topCategory: {
    id: string;
    name: string;
    emoji: string | null;
    delta: number;
  } | null;
  breakdown: {
    categoryId: string;
    name: string;
    emoji: string | null;
    baseline: number;
    actual: number;
    delta: number;
  }[];
  defaultGoalId: string | null;
};

export type ReclaimHistoryItem = {
  year: number;
  month: number;
  leakAmount: number;
  reclaimedAmount: number;
};

type Client = PrismaService | Prisma.TransactionClient;

const isUniqueViolation = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

const ALREADY_DECIDED: Record<LeakReclaimStatus, string> = {
  TRANSFERRED: 'Bạn đã chuyển tiền cho tháng này rồi',
  DISMISSED: 'Bạn đã bỏ qua đề xuất của tháng này',
};

@Injectable()
export class ReclaimService {
  constructor(
    private readonly _prisma: PrismaService,
    private readonly _goals: GoalService,
  ) {}

  async getOffer(
    userId: string,
    now: Date = new Date(),
  ): Promise<ReclaimOfferView> {
    const { target } = reclaimMonths(now);
    const [decision, result] = await Promise.all([
      this._findDecision(this._prisma, userId, target),
      this._compute(this._prisma, userId, now),
    ]);
    const view = await this._toView(userId, target, result);
    return decision ? { ...view, status: decision.status } : view;
  }

  async transfer(
    userId: string,
    dto: TransferReclaimDto,
    now: Date = new Date(),
  ) {
    const { target } = reclaimMonths(now);
    return this._prisma.$transaction(async (tx) => {
      const decision = await this._findDecision(tx, userId, target);
      if (decision)
        throw new ConflictException(ALREADY_DECIDED[decision.status]);

      // Never trust the client: recompute inside the transaction.
      const result = await this._compute(tx, userId, now);
      if (!result.eligible) {
        throw new ConflictException(
          'Không còn khoản tiền nào để chuyển cho tháng này',
        );
      }

      let reclaim: LeakReclaim;
      try {
        reclaim = await tx.leakReclaim.create({
          data: {
            userId,
            ...target,
            computedAmount: result.reclaimable,
            transferAmount: new Prisma.Decimal(dto.amount),
            status: LeakReclaimStatus.TRANSFERRED,
          },
        });
      } catch (e) {
        // Another request for the same month committed first.
        if (isUniqueViolation(e))
          throw new ConflictException(ALREADY_DECIDED.TRANSFERRED);
        throw e;
      }

      const { goal, contribution } = await this._goals.moveInTx(
        tx,
        userId,
        dto.goalId,
        {
          amount: dto.amount,
          accountId: dto.accountId,
          note: `Bịt rò rỉ tháng ${target.month}/${target.year}`,
        },
        'DEPOSIT',
        GoalContributionSource.LEAK_RECLAIM,
      );
      const linked = await tx.leakReclaim.update({
        where: { id: reclaim.id },
        data: { contributionId: contribution.id },
      });
      return { reclaim: linked, goal };
    });
  }

  async dismiss(userId: string, now: Date = new Date()) {
    const { target } = reclaimMonths(now);
    const existing = await this._findDecision(this._prisma, userId, target);
    if (existing) return { status: existing.status };

    const result = await this._compute(this._prisma, userId, now);
    try {
      await this._prisma.leakReclaim.create({
        data: {
          userId,
          ...target,
          computedAmount: result.reclaimable,
          status: LeakReclaimStatus.DISMISSED,
        },
      });
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
      const winner = await this._findDecision(this._prisma, userId, target);
      return { status: winner?.status ?? LeakReclaimStatus.DISMISSED };
    }
    return { status: LeakReclaimStatus.DISMISSED };
  }

  async getHistory(
    userId: string,
    months: number,
    now: Date = new Date(),
  ): Promise<ReclaimHistoryItem[]> {
    const keys = lastMonths(now, months);
    const [rows, reclaims] = await Promise.all([
      this._loadRows(this._prisma, userId, keys[0], keys[keys.length - 1]),
      this._prisma.leakReclaim.findMany({
        where: { userId, status: LeakReclaimStatus.TRANSFERRED },
      }),
    ]);
    const stats = bucketByMonth(rows, keys);
    return keys.map((k, i) => {
      const reclaim = reclaims.find(
        (r) => r.year === k.year && r.month === k.month,
      );
      const leak = [...stats[i].leakByCategory.values()].reduce(
        (sum, v) => sum.plus(v),
        new Prisma.Decimal(0),
      );
      return {
        ...k,
        leakAmount: leak.toNumber(),
        reclaimedAmount: Number(reclaim?.transferAmount ?? 0),
      };
    });
  }

  private _findDecision(client: Client, userId: string, target: MonthKey) {
    return client.leakReclaim.findUnique({
      where: { userId_year_month: { userId, ...target } },
    });
  }

  private async _compute(
    client: Client,
    userId: string,
    now: Date,
  ): Promise<ReclaimResult> {
    const { target, baseline } = reclaimMonths(now);
    const rows = await this._loadRows(client, userId, baseline[2], target);
    const [targetStats, ...baselineStats] = bucketByMonth(rows, [
      target,
      ...baseline,
    ]);
    return computeReclaim(targetStats, baselineStats);
  }

  /** Four months of expenses is a few hundred rows for a personal ledger; bucketing in code keeps the math testable. */
  private _loadRows(
    client: Client,
    userId: string,
    first: MonthKey,
    last: MonthKey,
  ) {
    return client.transaction.findMany({
      where: {
        userId,
        isDeleted: false,
        type: TransactionType.EXPENSE,
        createdAt: {
          gte: monthBounds(first).start,
          lte: monthBounds(last).end,
        },
      },
      select: {
        categoryId: true,
        amount: true,
        outcome: true,
        createdAt: true,
      },
    });
  }

  private async _toView(
    userId: string,
    target: MonthKey,
    result: ReclaimResult,
  ): Promise<ReclaimOfferView> {
    const ids = result.breakdown.map((b) => b.categoryId);
    const [categories, defaultGoalId] = await Promise.all([
      // Soft-deleted categories are included on purpose: past spend still counts.
      // `in: []` simply matches nothing, so no special-casing is needed here.
      this._prisma.category.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true, emoji: true },
      }),
      this._defaultGoalId(userId),
    ]);
    const meta = (id: string) => {
      const c = categories.find((x) => x.id === id);
      return { name: c?.name ?? 'Danh mục đã xóa', emoji: c?.emoji ?? null };
    };
    const breakdown = result.breakdown.map((b) => ({
      categoryId: b.categoryId,
      ...meta(b.categoryId),
      baseline: b.baseline.toNumber(),
      actual: b.actual.toNumber(),
      delta: b.delta.toNumber(),
    }));
    const top = breakdown.find((b) => b.categoryId === result.topCategoryId);
    return {
      ...target,
      status: result.eligible ? 'OPEN' : 'INELIGIBLE',
      reason: result.reason,
      reclaimableAmount: result.reclaimable.toNumber(),
      coverage: result.coverage,
      topCategory: top
        ? {
            id: top.categoryId,
            name: top.name,
            emoji: top.emoji,
            delta: top.delta,
          }
        : null,
      breakdown,
      defaultGoalId,
    };
  }

  /** Last reclaim deposit's goal, else last deposit's goal, else the first unfinished goal. */
  private async _defaultGoalId(userId: string): Promise<string | null> {
    const active = {
      userId,
      type: GoalContributionType.DEPOSIT,
      goal: { isDeleted: false },
    };
    const last = (where: object) =>
      this._prisma.goalContribution.findFirst({
        where,
        orderBy: { createdAt: 'desc' },
        select: { goalId: true },
      });
    const lastReclaim = await last({
      ...active,
      source: GoalContributionSource.LEAK_RECLAIM,
    });
    if (lastReclaim) return lastReclaim.goalId;
    const lastDeposit = await last(active);
    if (lastDeposit) return lastDeposit.goalId;
    const goals = await this._prisma.goal.findMany({
      where: { userId, isDeleted: false },
      orderBy: { createdAt: 'asc' },
    });
    return (
      (goals.find((g) => g.savedAmount.lessThan(g.targetAmount)) ?? goals[0])
        ?.id ?? null
    );
  }
}
