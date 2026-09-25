import { LeakReason, SpendOutcome } from '@/generated/prisma/client';
import { buildLeakRateReport, type OutcomeGroup } from './leak-rate.calculator';

const coffee = { id: 'c-coffee', name: 'Cà phê', emoji: '☕' };
const food = { id: 'c-food', name: 'Ăn uống', emoji: '🍜' };

function group(
  categoryId: string,
  outcome: SpendOutcome,
  amount: number,
  count: number,
): OutcomeGroup {
  return { categoryId, outcome, amount, count };
}

describe('buildLeakRateReport', () => {
  it('uses reviewed spend as the denominator and keeps unreviewed separate', () => {
    const report = buildLeakRateReport(
      9,
      2026,
      [
        group(coffee.id, SpendOutcome.LEAK, 300_000, 3),
        group(coffee.id, SpendOutcome.WORTH_IT, 200_000, 2),
        group(coffee.id, SpendOutcome.NEUTRAL, 100_000, 1),
        group(coffee.id, SpendOutcome.UNREVIEWED, 400_000, 4),
      ],
      [],
      [coffee],
    );

    const row = report.categories[0];
    expect(row).toMatchObject({
      categoryId: coffee.id,
      name: 'Cà phê',
      emoji: '☕',
      totalSpent: 1_000_000,
      leakAmount: 300_000,
      worthItAmount: 200_000,
      neutralAmount: 100_000,
      unreviewedAmount: 400_000,
      reviewedCount: 6,
      leakRate: 0.5, // 300k / (1,000k - 400k)
    });
    expect(report.month).toBe(9);
    expect(report.year).toBe(2026);
  });

  it('returns a null rate below 5 reviewed expenses', () => {
    const report = buildLeakRateReport(
      9,
      2026,
      [
        group(coffee.id, SpendOutcome.LEAK, 50_000, 1),
        group(coffee.id, SpendOutcome.WORTH_IT, 50_000, 3),
      ],
      [],
      [coffee],
    );
    expect(report.categories[0].reviewedCount).toBe(4);
    expect(report.categories[0].leakRate).toBeNull();
  });

  it('returns a null rate and no reason when everything is unreviewed', () => {
    const report = buildLeakRateReport(
      9,
      2026,
      [group(coffee.id, SpendOutcome.UNREVIEWED, 90_000, 9)],
      [],
      [coffee],
    );
    expect(report.categories[0]).toMatchObject({
      leakAmount: 0,
      unreviewedAmount: 90_000,
      reviewedCount: 0,
      leakRate: null,
      topLeakReason: null,
    });
    expect(report.summary.leakAmount).toBe(0);
  });

  it('sorts by leak amount desc, then total spent desc', () => {
    const report = buildLeakRateReport(
      9,
      2026,
      [
        group(coffee.id, SpendOutcome.LEAK, 100_000, 1),
        group(food.id, SpendOutcome.LEAK, 250_000, 1),
        group('c-rent', SpendOutcome.NEUTRAL, 5_000_000, 1),
        group('c-gym', SpendOutcome.NEUTRAL, 500_000, 1),
      ],
      [],
      [coffee, food],
    );
    expect(report.categories.map((r) => r.categoryId)).toEqual([
      food.id,
      coffee.id,
      'c-rent',
      'c-gym',
    ]);
  });

  it('picks the reason with the largest leaked amount, ties by enum order', () => {
    const report = buildLeakRateReport(
      9,
      2026,
      [group(coffee.id, SpendOutcome.LEAK, 300_000, 3)],
      [
        {
          categoryId: coffee.id,
          leakReason: LeakReason.SOCIAL_PRESSURE,
          amount: 100_000,
        },
        {
          categoryId: coffee.id,
          leakReason: LeakReason.IMPULSIVE,
          amount: 100_000,
        },
        { categoryId: coffee.id, leakReason: LeakReason.OTHER, amount: 50_000 },
      ],
      [coffee],
    );
    expect(report.categories[0].topLeakReason).toBe(LeakReason.IMPULSIVE);
  });

  it('builds a summary across all categories', () => {
    const report = buildLeakRateReport(
      9,
      2026,
      [
        group(coffee.id, SpendOutcome.LEAK, 100_000, 3),
        group(food.id, SpendOutcome.WORTH_IT, 300_000, 3),
      ],
      [
        {
          categoryId: coffee.id,
          leakReason: LeakReason.UNUSED,
          amount: 100_000,
        },
      ],
      [coffee, food],
    );
    expect(report.summary).toMatchObject({
      categoryId: null,
      name: null,
      emoji: null,
      totalSpent: 400_000,
      leakAmount: 100_000,
      reviewedCount: 6,
      leakRate: 0.25,
      topLeakReason: LeakReason.UNUSED,
    });
  });

  it('keeps rows whose category is missing from the lookup, with a null name', () => {
    const report = buildLeakRateReport(
      9,
      2026,
      [group('c-unknown', SpendOutcome.LEAK, 10_000, 1)],
      [],
      [],
    );
    expect(report.categories[0]).toMatchObject({
      categoryId: 'c-unknown',
      name: null,
      emoji: null,
    });
  });

  it('returns an empty report for a month without expenses', () => {
    const report = buildLeakRateReport(9, 2026, [], [], []);
    expect(report.categories).toEqual([]);
    expect(report.summary).toMatchObject({ totalSpent: 0, leakRate: null });
  });
});
