import {
  GoalContributionType,
  Prisma,
  TransactionType,
} from '@/generated/prisma/client';
import {
  type BalanceChange,
  type LedgerEntry,
  planBalanceChanges,
  planContributionChanges,
  signedAmount,
} from './ledger.calculator';

const { INCOME, EXPENSE } = TransactionType;
const D = Prisma.Decimal;

const entry = (
  accountId: string,
  type: TransactionType,
  amount: number | string,
): LedgerEntry => ({ accountId, type, amount: new D(amount) });

const plain = (changes: BalanceChange[]) =>
  changes.map((c) => ({ accountId: c.accountId, delta: c.delta.toString() }));

/** Deterministic PRNG so the property test is reproducible. */
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('signedAmount', () => {
  it('is positive for income and negative for expense', () => {
    expect(signedAmount(entry('a', INCOME, 1000)).toString()).toBe('1000');
    expect(signedAmount(entry('a', EXPENSE, 1000)).toString()).toBe('-1000');
  });

  it('accepts plain numbers and strings', () => {
    expect(
      signedAmount({ accountId: 'a', type: EXPENSE, amount: 12.5 }).toString(),
    ).toBe('-12.5');
    expect(
      signedAmount({
        accountId: 'a',
        type: INCOME,
        amount: '99.99',
      }).toString(),
    ).toBe('99.99');
  });
});

describe('planBalanceChanges', () => {
  it('create: applies the signed amount to the wallet', () => {
    expect(
      plain(planBalanceChanges(null, entry('cash', EXPENSE, 50000))),
    ).toEqual([{ accountId: 'cash', delta: '-50000' }]);
    expect(
      plain(planBalanceChanges(null, entry('cash', INCOME, 50000))),
    ).toEqual([{ accountId: 'cash', delta: '50000' }]);
  });

  it('delete: reverses the signed amount', () => {
    expect(
      plain(planBalanceChanges(entry('cash', EXPENSE, 50000), null)),
    ).toEqual([{ accountId: 'cash', delta: '50000' }]);
  });

  it('update amount only: one merged delta on the same wallet', () => {
    expect(
      plain(
        planBalanceChanges(
          entry('cash', EXPENSE, 50000),
          entry('cash', EXPENSE, 80000),
        ),
      ),
    ).toEqual([{ accountId: 'cash', delta: '-30000' }]);
  });

  it('update type flip: expense to income moves twice the amount', () => {
    expect(
      plain(
        planBalanceChanges(
          entry('cash', EXPENSE, 50000),
          entry('cash', INCOME, 50000),
        ),
      ),
    ).toEqual([{ accountId: 'cash', delta: '100000' }]);
  });

  it('update wallet move: reverses on the old wallet and applies on the new one', () => {
    expect(
      plain(
        planBalanceChanges(
          entry('cash', EXPENSE, 50000),
          entry('bank', EXPENSE, 50000),
        ),
      ),
    ).toEqual([
      { accountId: 'cash', delta: '50000' },
      { accountId: 'bank', delta: '-50000' },
    ]);
  });

  it('update amount + type + wallet together', () => {
    expect(
      plain(
        planBalanceChanges(
          entry('cash', EXPENSE, 50000),
          entry('bank', INCOME, 20000),
        ),
      ),
    ).toEqual([
      { accountId: 'cash', delta: '50000' },
      { accountId: 'bank', delta: '20000' },
    ]);
  });

  it('update with no money change returns no changes', () => {
    expect(
      planBalanceChanges(
        entry('cash', EXPENSE, 50000),
        entry('cash', EXPENSE, '50000.00'),
      ),
    ).toEqual([]);
  });

  it('keeps every balance equal to initial + live rows over 500 random operations', () => {
    const rand = mulberry32(20260925);
    const pick = <T>(xs: T[]): T => xs[Math.floor(rand() * xs.length)];
    const wallets = ['cash', 'bank', 'card'];
    const types = [INCOME, EXPENSE];
    const randomAmount = () =>
      new D(1 + Math.floor(rand() * 99_999_999)).dividedBy(100);

    const initial: Record<string, Prisma.Decimal> = {
      cash: new D(100000),
      bank: new D('2500000.55'),
      card: new D(0),
    };
    const balances = { ...initial };
    const live = new Map<string, LedgerEntry>();

    for (let i = 0; i < 500; i++) {
      const ids = [...live.keys()];
      const roll = rand();
      let before: LedgerEntry | null = null;
      let after: LedgerEntry | null = null;

      if (roll < 0.5 || ids.length === 0) {
        after = {
          accountId: pick(wallets),
          type: pick(types),
          amount: randomAmount(),
        };
        live.set(`t${i}`, after);
      } else if (roll < 0.8) {
        const id = pick(ids);
        before = live.get(id)!;
        after = {
          accountId: rand() < 0.5 ? before.accountId : pick(wallets),
          type: rand() < 0.5 ? before.type : pick(types),
          amount: rand() < 0.5 ? before.amount : randomAmount(),
        };
        live.set(id, after);
      } else {
        const id = pick(ids);
        before = live.get(id)!;
        live.delete(id);
      }

      for (const change of planBalanceChanges(before, after)) {
        balances[change.accountId] = balances[change.accountId].plus(
          change.delta,
        );
      }
    }

    for (const wallet of wallets) {
      const expected = [...live.values()]
        .filter((e) => e.accountId === wallet)
        .reduce((sum, e) => sum.plus(signedAmount(e)), initial[wallet]);
      expect(balances[wallet].toString()).toBe(expected.toString());
    }
  });
});

describe('planContributionChanges', () => {
  const { DEPOSIT, WITHDRAWAL, OPENING } = GoalContributionType;

  it('a deposit takes money out of the wallet', () => {
    expect(
      plain(
        planContributionChanges({
          accountId: 'w',
          type: DEPOSIT,
          amount: new D('500000.50'),
        }),
      ),
    ).toEqual([{ accountId: 'w', delta: '-500000.5' }]);
  });

  it('a withdrawal puts money back into the wallet', () => {
    expect(
      plain(
        planContributionChanges({
          accountId: 'w',
          type: WITHDRAWAL,
          amount: new D(200000),
        }),
      ),
    ).toEqual([{ accountId: 'w', delta: '200000' }]);
  });

  it('an opening balance touches no wallet', () => {
    expect(
      planContributionChanges({
        accountId: null,
        type: OPENING,
        amount: new D(1),
      }),
    ).toEqual([]);
  });

  it('rejects a deposit or withdrawal without a wallet', () => {
    expect(() =>
      planContributionChanges({
        accountId: null,
        type: DEPOSIT,
        amount: new D(1),
      }),
    ).toThrow('DEPOSIT needs a wallet');
  });
});
