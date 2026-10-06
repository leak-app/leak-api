import { Prisma, SpendOutcome } from '@/generated/prisma/client';
import {
  bucketByMonth,
  computeReclaim,
  lastMonths,
  monthBounds,
  reclaimMonths,
  type ExpenseRow,
  type MonthStats,
} from './reclaim.calculator';

const { LEAK, WORTH_IT, UNREVIEWED } = SpendOutcome;
const D = (v: number) => new Prisma.Decimal(v);

/** Local-time dates, like the server buckets. */
const row = (
  categoryId: string,
  amount: number,
  outcome: SpendOutcome,
  year: number,
  month: number,
  day = 10,
): ExpenseRow => ({
  categoryId,
  amount: D(amount),
  outcome,
  createdAt: new Date(year, month - 1, day, 12),
});

const stats = (
  total: number,
  reviewed: number,
  leaks: Record<string, number> = {},
): MonthStats => ({
  totalExpense: D(total),
  reviewedAmount: D(reviewed),
  leakByCategory: new Map(Object.entries(leaks).map(([k, v]) => [k, D(v)])),
});

describe('reclaimMonths / lastMonths / monthBounds', () => {
  it('targets the previous month and the three before it', () => {
    expect(reclaimMonths(new Date(2026, 9, 1, 0, 5))).toEqual({
      target: { year: 2026, month: 9 },
      baseline: [
        { year: 2026, month: 8 },
        { year: 2026, month: 7 },
        { year: 2026, month: 6 },
      ],
    });
  });

  it('wraps across a year boundary', () => {
    expect(reclaimMonths(new Date(2027, 0, 15)).target).toEqual({
      year: 2026,
      month: 12,
    });
    expect(reclaimMonths(new Date(2027, 0, 15)).baseline[2]).toEqual({
      year: 2026,
      month: 9,
    });
  });

  it('lists completed months oldest first', () => {
    expect(lastMonths(new Date(2026, 9, 5), 3)).toEqual([
      { year: 2026, month: 7 },
      { year: 2026, month: 8 },
      { year: 2026, month: 9 },
    ]);
  });

  it('month bounds cover the whole local month', () => {
    const { start, end } = monthBounds({ year: 2026, month: 9 });
    expect(start).toEqual(new Date(2026, 8, 1, 0, 0, 0, 0));
    expect(end).toEqual(new Date(2026, 8, 30, 23, 59, 59, 999));
  });
});

describe('bucketByMonth', () => {
  it('puts 30 Sep 23:59 in September and splits reviewed / leak amounts', () => {
    const rows = [
      {
        ...row('coffee', 100, LEAK, 2026, 9),
        createdAt: new Date(2026, 8, 30, 23, 59),
      },
      row('coffee', 50, UNREVIEWED, 2026, 9),
      row('food', 30, WORTH_IT, 2026, 9),
      row('coffee', 999, LEAK, 2026, 10, 1),
    ];
    const [sep] = bucketByMonth(rows, [{ year: 2026, month: 9 }]);
    expect(sep.totalExpense.toString()).toBe('180');
    expect(sep.reviewedAmount.toString()).toBe('130');
    expect(sep.leakByCategory.get('coffee')?.toString()).toBe('100');
    expect(sep.leakByCategory.has('food')).toBe(false);
  });
});

describe('computeReclaim', () => {
  const baselineCoffee = [
    stats(2000000, 2000000, { coffee: 1000000 }),
    stats(2000000, 2000000, { coffee: 1000000 }),
    stats(2000000, 2000000, { coffee: 1000000 }),
  ];

  it('roadmap example: coffee 1tr baseline, 400k actual → 600k', () => {
    const r = computeReclaim(
      stats(1500000, 1500000, { coffee: 400000 }),
      baselineCoffee,
    );
    expect(r.eligible).toBe(true);
    expect(r.reason).toBeNull();
    expect(r.reclaimable.toString()).toBe('600000');
    expect(r.topCategoryId).toBe('coffee');
    expect(r.coverage).toBe(1);
  });

  it('a category that leaked more contributes 0 but stays in the breakdown', () => {
    const r = computeReclaim(
      stats(3000000, 3000000, { coffee: 400000, shopping: 900000 }),
      [
        stats(2000000, 2000000, { coffee: 1000000, shopping: 300000 }),
        stats(2000000, 2000000, { coffee: 1000000, shopping: 300000 }),
      ],
    );
    expect(r.reclaimable.toString()).toBe('600000');
    const shopping = r.breakdown.find((b) => b.categoryId === 'shopping');
    expect(shopping?.delta.toString()).toBe('-600000');
  });

  it('needs at least 2 qualifying baseline months', () => {
    const r = computeReclaim(stats(100000, 100000), [
      stats(500000, 500000, { coffee: 500000 }),
      stats(0, 0),
      stats(300000, 0), // spent but nothing reviewed: does not qualify
    ]);
    expect(r).toMatchObject({ eligible: false, reason: 'NOT_ENOUGH_HISTORY' });
  });

  it('a qualifying month with no leak in a category counts as 0 for it', () => {
    const r = computeReclaim(stats(1000000, 1000000, { coffee: 0 }), [
      stats(1000000, 1000000, { coffee: 900000 }),
      stats(1000000, 1000000, {}),
    ]);
    // baseline = (900000 + 0) / 2 = 450000
    expect(r.reclaimable.toString()).toBe('450000');
  });

  it('no spending in the target month → NO_SPENDING', () => {
    expect(computeReclaim(stats(0, 0), baselineCoffee)).toMatchObject({
      eligible: false,
      reason: 'NO_SPENDING',
    });
  });

  it('coverage 69.9% → LOW_COVERAGE; exactly 70% → eligible', () => {
    const low = computeReclaim(
      stats(1000000, 699000, { coffee: 100000 }),
      baselineCoffee,
    );
    expect(low).toMatchObject({ eligible: false, reason: 'LOW_COVERAGE' });
    expect(low.coverage).toBeCloseTo(0.699);
    const ok = computeReclaim(
      stats(1000000, 700000, { coffee: 100000 }),
      baselineCoffee,
    );
    expect(ok.eligible).toBe(true);
  });

  it('rounds down to 1.000 ₫ and refuses offers below 10.000 ₫', () => {
    const r = computeReclaim(
      stats(100000, 100000, { coffee: 990500 }),
      baselineCoffee,
    );
    // 1000000 − 990500 = 9500 → 9000 < 10000
    expect(r.reclaimable.toString()).toBe('9000');
    expect(r).toMatchObject({ eligible: false, reason: 'TOO_SMALL' });

    const r2 = computeReclaim(
      stats(100000, 100000, { coffee: 987654 }),
      baselineCoffee,
    );
    expect(r2.reclaimable.toString()).toBe('12000'); // 12346 → 12000
    expect(r2.eligible).toBe(true);
  });

  it('breaks a top-category tie by the lower categoryId', () => {
    const r = computeReclaim(stats(1000000, 1000000, { b: 0, a: 0 }), [
      stats(1000000, 1000000, { a: 100000, b: 100000 }),
      stats(1000000, 1000000, { a: 100000, b: 100000 }),
    ]);
    expect(r.topCategoryId).toBe('a');
  });
});
