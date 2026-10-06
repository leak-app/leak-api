import dayjs, { type Dayjs } from 'dayjs';
import { Prisma, SpendOutcome } from '@/generated/prisma/client';

export const MIN_BASELINE_MONTHS = 2;
export const MIN_COVERAGE = new Prisma.Decimal('0.7');
export const MIN_OFFER = new Prisma.Decimal(10000);

export type MonthKey = { year: number; month: number };
export type ExpenseRow = {
  categoryId: string;
  amount: Prisma.Decimal | number | string;
  outcome: SpendOutcome;
  createdAt: Date;
};
export type MonthStats = {
  totalExpense: Prisma.Decimal;
  reviewedAmount: Prisma.Decimal;
  leakByCategory: Map<string, Prisma.Decimal>;
};
export type IneligibleReason =
  | 'NOT_ENOUGH_HISTORY'
  | 'NO_SPENDING'
  | 'LOW_COVERAGE'
  | 'TOO_SMALL';
export type BreakdownRow = {
  categoryId: string;
  baseline: Prisma.Decimal;
  actual: Prisma.Decimal;
  delta: Prisma.Decimal;
};
export type ReclaimResult = {
  eligible: boolean;
  reason: IneligibleReason | null;
  reclaimable: Prisma.Decimal;
  coverage: number | null;
  topCategoryId: string | null;
  breakdown: BreakdownRow[];
};

const zero = () => new Prisma.Decimal(0);
const keyOf = (d: Dayjs): MonthKey => ({
  year: d.year(),
  month: d.month() + 1,
});

/** Server local time, like OverviewService and the leak report. */
export function reclaimMonths(now: Date): {
  target: MonthKey;
  baseline: MonthKey[];
} {
  const thisMonth = dayjs(now).startOf('month');
  return {
    target: keyOf(thisMonth.subtract(1, 'month')),
    baseline: [2, 3, 4].map((n) => keyOf(thisMonth.subtract(n, 'month'))),
  };
}

/** The last `count` completed months, oldest first. */
export function lastMonths(now: Date, count: number): MonthKey[] {
  const thisMonth = dayjs(now).startOf('month');
  return Array.from({ length: count }, (_, i) =>
    keyOf(thisMonth.subtract(count - i, 'month')),
  );
}

export function monthBounds(key: MonthKey): { start: Date; end: Date } {
  // Built from day 1 so a 31st never overflows into the next month.
  const start = dayjs(new Date(key.year, key.month - 1, 1)).startOf('month');
  return { start: start.toDate(), end: start.endOf('month').toDate() };
}

const inMonth = (d: Date, k: MonthKey) =>
  d.getFullYear() === k.year && d.getMonth() + 1 === k.month;

export function bucketByMonth(
  rows: ExpenseRow[],
  months: MonthKey[],
): MonthStats[] {
  return months.map((k) => {
    const s: MonthStats = {
      totalExpense: zero(),
      reviewedAmount: zero(),
      leakByCategory: new Map(),
    };
    for (const r of rows) {
      if (!inMonth(r.createdAt, k)) continue;
      const amount = new Prisma.Decimal(r.amount);
      s.totalExpense = s.totalExpense.plus(amount);
      if (r.outcome !== SpendOutcome.UNREVIEWED) {
        s.reviewedAmount = s.reviewedAmount.plus(amount);
      }
      if (r.outcome === SpendOutcome.LEAK) {
        s.leakByCategory.set(
          r.categoryId,
          (s.leakByCategory.get(r.categoryId) ?? zero()).plus(amount),
        );
      }
    }
    return s;
  });
}

export function computeReclaim(
  target: MonthStats,
  baseline: MonthStats[],
): ReclaimResult {
  const empty = { reclaimable: zero(), topCategoryId: null, breakdown: [] };
  const qualifying = baseline.filter((m) => m.reviewedAmount.greaterThan(0));
  if (qualifying.length < MIN_BASELINE_MONTHS) {
    return {
      eligible: false,
      reason: 'NOT_ENOUGH_HISTORY',
      coverage: null,
      ...empty,
    };
  }
  if (target.totalExpense.isZero()) {
    return { eligible: false, reason: 'NO_SPENDING', coverage: null, ...empty };
  }

  const coverageDecimal = target.reviewedAmount.dividedBy(target.totalExpense);
  const categoryIds = new Set([
    ...target.leakByCategory.keys(),
    ...qualifying.flatMap((m) => [...m.leakByCategory.keys()]),
  ]);

  const breakdown = [...categoryIds]
    .map((categoryId) => {
      const baselineAmount = qualifying
        .reduce(
          (sum, m) => sum.plus(m.leakByCategory.get(categoryId) ?? 0),
          zero(),
        )
        .dividedBy(qualifying.length);
      const actual = target.leakByCategory.get(categoryId) ?? zero();
      return {
        categoryId,
        baseline: baselineAmount,
        actual,
        delta: baselineAmount.minus(actual),
      };
    })
    .sort(
      (a, b) =>
        b.delta.comparedTo(a.delta) || a.categoryId.localeCompare(b.categoryId),
    );

  const positive = breakdown.reduce(
    (sum, r) => (r.delta.greaterThan(0) ? sum.plus(r.delta) : sum),
    zero(),
  );
  const reclaimable = positive.dividedBy(1000).floor().times(1000);
  const top = breakdown[0];
  const common = {
    reclaimable,
    coverage: coverageDecimal.toNumber(),
    topCategoryId: top && top.delta.greaterThan(0) ? top.categoryId : null,
    breakdown,
  };

  if (coverageDecimal.lessThan(MIN_COVERAGE)) {
    return { eligible: false, reason: 'LOW_COVERAGE', ...common };
  }
  if (reclaimable.lessThan(MIN_OFFER)) {
    return { eligible: false, reason: 'TOO_SMALL', ...common };
  }
  return { eligible: true, reason: null, ...common };
}
