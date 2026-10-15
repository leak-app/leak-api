import { Prisma, ValuationKind } from '@/generated/prisma/client';
import {
  computeValuation,
  ictToday,
  isStale,
  monthlySeries,
  periodReturn,
  profitInMonth,
  walletTotals,
} from './portfolio.calculator';

const d = (value: number) => new Prisma.Decimal(value);

describe('computeValuation', () => {
  it('splits profit from a deposit: 45M + 5M in, entered 52M, gain 2M', () => {
    const result = computeValuation({
      currentBalance: 50_000_000,
      initialBalance: 45_000_000,
      previousBalance: null,
      enteredBalance: 52_000_000,
      asBaseline: false,
    });
    expect(result.kind).toBe(ValuationKind.UPDATE);
    expect(result.previousBalance.toNumber()).toBe(45_000_000);
    expect(result.netFlow.toNumber()).toBe(5_000_000);
    expect(result.gain.toNumber()).toBe(2_000_000);
    expect(result.adjustment.toNumber()).toBe(2_000_000);
  });

  it('measures from the previous update, not from the opening balance', () => {
    const result = computeValuation({
      currentBalance: 60_000_000, // 52M + 8M deposited since
      initialBalance: 45_000_000,
      previousBalance: 52_000_000,
      enteredBalance: 59_000_000,
      asBaseline: false,
    });
    expect(result.netFlow.toNumber()).toBe(8_000_000);
    expect(result.gain.toNumber()).toBe(-1_000_000);
    expect(result.adjustment.toNumber()).toBe(-1_000_000);
  });

  it('records a zero difference as an update with no gain', () => {
    const result = computeValuation({
      currentBalance: 52_000_000,
      initialBalance: 45_000_000,
      previousBalance: 52_000_000,
      enteredBalance: 52_000_000,
      asBaseline: false,
    });
    expect(result.gain.isZero()).toBe(true);
    expect(result.adjustment.isZero()).toBe(true);
  });

  it('counts the first difference as capital when it is a baseline', () => {
    const result = computeValuation({
      currentBalance: 45_000_000,
      initialBalance: 45_000_000,
      previousBalance: null,
      enteredBalance: 70_000_000,
      asBaseline: true,
    });
    expect(result.kind).toBe(ValuationKind.BASELINE);
    expect(result.gain.isZero()).toBe(true);
    expect(result.adjustment.toNumber()).toBe(25_000_000);
  });

  it('ignores the baseline flag once an update exists', () => {
    const result = computeValuation({
      currentBalance: 52_000_000,
      initialBalance: 45_000_000,
      previousBalance: 52_000_000,
      enteredBalance: 53_000_000,
      asBaseline: true,
    });
    expect(result.kind).toBe(ValuationKind.UPDATE);
    expect(result.gain.toNumber()).toBe(1_000_000);
  });
});

describe('periodReturn', () => {
  it('divides the gain by the previous balance plus money moved in', () => {
    // 2M ÷ (45M + 5M) = 4.0 %
    expect(
      periodReturn({
        kind: ValuationKind.UPDATE,
        previousBalance: d(45_000_000),
        netFlow: d(5_000_000),
        gain: d(2_000_000),
      }),
    ).toBe(4);
  });

  it('does not let a withdrawal shrink the base', () => {
    // base stays 50M, so −1M is −2.0 %
    expect(
      periodReturn({
        kind: ValuationKind.UPDATE,
        previousBalance: d(50_000_000),
        netFlow: d(-10_000_000),
        gain: d(-1_000_000),
      }),
    ).toBe(-2);
  });

  it('is null for a baseline and for an empty base', () => {
    expect(
      periodReturn({
        kind: ValuationKind.BASELINE,
        previousBalance: d(1),
        netFlow: d(0),
        gain: d(0),
      }),
    ).toBeNull();
    expect(
      periodReturn({
        kind: ValuationKind.UPDATE,
        previousBalance: d(0),
        netFlow: d(0),
        gain: d(100),
      }),
    ).toBeNull();
  });

  it('rounds to one decimal', () => {
    expect(
      periodReturn({
        kind: ValuationKind.UPDATE,
        previousBalance: d(30_000_000),
        netFlow: d(0),
        gain: d(1_000_000),
      }),
    ).toBe(3.3);
  });
});

describe('walletTotals', () => {
  it('derives capital by taking the gains out of the balance', () => {
    const totals = walletTotals(d(59_000_000), [d(2_000_000), d(-1_000_000)]);
    expect(totals.profit.toNumber()).toBe(1_000_000);
    expect(totals.capital.toNumber()).toBe(58_000_000);
    expect(totals.returnPercent).toBe(1.7);
  });

  it('is zero profit without updates and null return without capital', () => {
    expect(walletTotals(d(10), []).profit.isZero()).toBe(true);
    expect(walletTotals(d(5), [d(5)]).returnPercent).toBeNull();
  });
});

describe('isStale', () => {
  const now = new Date('2026-11-02T03:00:00Z'); // 10:00 on 2 Nov in Vietnam

  it('is stale when the last update was in an earlier month', () => {
    expect(isStale(new Date('2026-10-31T00:00:00Z'), new Date(0), now)).toBe(
      true,
    );
  });

  it('is fresh when updated this month', () => {
    expect(isStale(new Date('2026-11-01T00:00:00Z'), new Date(0), now)).toBe(
      false,
    );
  });

  it('counts a never-updated wallet from its creation month', () => {
    expect(isStale(null, new Date('2026-11-01T10:00:00Z'), now)).toBe(false);
    expect(isStale(null, new Date('2026-09-15T10:00:00Z'), now)).toBe(true);
  });

  it('uses Vietnam time at the month boundary and across the year', () => {
    // 17:30 UTC on 31 Oct is already 1 Nov in Vietnam
    const boundary = new Date('2026-10-31T17:30:00Z');
    expect(
      isStale(new Date('2026-10-31T00:00:00Z'), new Date(0), boundary),
    ).toBe(true);
    const january = new Date('2027-01-05T00:00:00Z');
    expect(
      isStale(new Date('2026-12-20T00:00:00Z'), new Date(0), january),
    ).toBe(true);
  });
});

describe('ictToday', () => {
  it('returns the Vietnamese calendar day at UTC midnight', () => {
    expect(ictToday(new Date('2026-10-31T18:00:00Z')).toISOString()).toBe(
      '2026-11-01T00:00:00.000Z',
    );
  });
});

describe('monthlySeries', () => {
  const now = new Date('2026-12-05T03:00:00Z');
  const v = (
    accountId: string,
    valuedAt: string,
    balance: number,
    gain: number,
    netFlow = 0,
    kind: ValuationKind = ValuationKind.UPDATE,
  ) => ({
    accountId,
    kind,
    valuedAt: new Date(`${valuedAt}T00:00:00Z`),
    previousBalance: d(balance - gain - netFlow),
    netFlow: d(netFlow),
    balance: d(balance),
    gain: d(gain),
  });

  it('is empty without updates', () => {
    expect(monthlySeries([], now, 12)).toEqual([]);
  });

  it('starts at the first month with an update and carries balances forward', () => {
    const series = monthlySeries(
      [v('a', '2026-10-01', 52, 2), v('a', '2026-12-02', 60, 3)],
      now,
      12,
    );
    expect(
      series.map((p) => [p.month, p.balance.toNumber(), p.profit.toNumber()]),
    ).toEqual([
      ['2026-10', 52, 2],
      ['2026-11', 52, 0],
      ['2026-12', 60, 3],
    ]);
  });

  it('adds wallets together once each has started', () => {
    const series = monthlySeries(
      [
        v('a', '2026-11-01', 10, 1),
        v('b', '2026-12-01', 5, 0.5),
        v('a', '2026-12-01', 12, 2),
      ],
      now,
      12,
    );
    expect(
      series.map((p) => [p.month, p.balance.toNumber(), p.profit.toNumber()]),
    ).toEqual([
      ['2026-11', 10, 1],
      ['2026-12', 17, 2.5],
    ]);
  });

  it('keeps only the last N months, still carrying earlier balances', () => {
    const series = monthlySeries(
      [v('a', '2026-01-10', 100, 5), v('a', '2026-12-02', 120, 4)],
      now,
      2,
    );
    expect(series.map((p) => [p.month, p.balance.toNumber()])).toEqual([
      ['2026-11', 100],
      ['2026-12', 120],
    ]);
  });

  it('crosses the year boundary', () => {
    const series = monthlySeries(
      [v('a', '2026-12-20', 10, 1)],
      new Date('2027-01-10T00:00:00Z'),
      12,
    );
    expect(series.map((p) => p.month)).toEqual(['2026-12', '2027-01']);
  });
});

describe('monthlySeries returnPercent', () => {
  const now = new Date('2026-12-05T03:00:00Z');
  const v = (
    accountId: string,
    valuedAt: string,
    previousBalance: number,
    netFlow: number,
    gain: number,
    kind: ValuationKind = ValuationKind.UPDATE,
  ) => ({
    accountId,
    kind,
    valuedAt: new Date(`${valuedAt}T00:00:00Z`),
    previousBalance: d(previousBalance),
    netFlow: d(netFlow),
    balance: d(previousBalance + netFlow + gain),
    gain: d(gain),
  });

  it('divides the gain by the previous balance plus money added', () => {
    // 10M + 2M in, gain 0.6M → 0.6 ÷ 12 = 5.0%
    const [point] = monthlySeries(
      [v('a', '2026-12-01', 10_000_000, 2_000_000, 600_000)],
      now,
      12,
    );
    expect(point.returnPercent).toBe(5);
  });

  it('pools wallets of the same month', () => {
    // gains 1M + 0.5M over bases 10M + 5M → 10.0%
    const [point] = monthlySeries(
      [
        v('a', '2026-12-01', 10_000_000, 0, 1_000_000),
        v('b', '2026-12-02', 5_000_000, 0, 500_000),
      ],
      now,
      12,
    );
    expect(point.returnPercent).toBe(10);
  });

  it('is null for a baseline and for a month without updates', () => {
    const series = monthlySeries(
      [v('a', '2026-11-01', 8_000_000, 0, 0, ValuationKind.BASELINE)],
      now,
      12,
    );
    expect(series.map((p) => p.returnPercent)).toEqual([null, null]);
  });
});

describe('profitInMonth', () => {
  const now = new Date('2026-12-05T03:00:00Z');
  const row = (valuedAt: string, gain: number) => ({
    valuedAt: new Date(`${valuedAt}T00:00:00Z`),
    gain: d(gain),
  });

  it('adds only the gains of the current month', () => {
    const total = profitInMonth(
      [row('2026-11-30', 9), row('2026-12-01', 2), row('2026-12-04', -0.5)],
      now,
    );
    expect(total.toNumber()).toBe(1.5);
  });

  it('is zero without updates this month', () => {
    expect(profitInMonth([row('2026-10-01', 4)], now).toNumber()).toBe(0);
  });
});
