import {
  GoalContributionType,
  Prisma,
  TransactionType,
} from '@/generated/prisma/client';

export type LedgerEntry = {
  accountId: string;
  type: TransactionType;
  amount: Prisma.Decimal | number | string;
};

export type BalanceChange = { accountId: string; delta: Prisma.Decimal };

/** Income adds to a wallet, expense subtracts from it. */
export function signedAmount(entry: LedgerEntry): Prisma.Decimal {
  const amount = new Prisma.Decimal(entry.amount);
  return entry.type === TransactionType.INCOME ? amount : amount.negated();
}

/**
 * Balance deltas for moving a transaction from `before` to `after`.
 * `before = null` is a create, `after = null` is a delete.
 * Deltas are merged per wallet and zero deltas are dropped.
 */
export function planBalanceChanges(
  before: LedgerEntry | null,
  after: LedgerEntry | null,
): BalanceChange[] {
  const deltas = new Map<string, Prisma.Decimal>();
  const add = (accountId: string, delta: Prisma.Decimal) =>
    deltas.set(
      accountId,
      (deltas.get(accountId) ?? new Prisma.Decimal(0)).plus(delta),
    );

  if (before) add(before.accountId, signedAmount(before).negated());
  if (after) add(after.accountId, signedAmount(after));

  return [...deltas]
    .filter(([, delta]) => !delta.isZero())
    .map(([accountId, delta]) => ({ accountId, delta }));
}

export type ContributionEntry = {
  accountId: string | null;
  type: GoalContributionType;
  amount: Prisma.Decimal | number | string;
};

/** Deposits leave a wallet, withdrawals return to it, openings touch no wallet. */
export function planContributionChanges(c: ContributionEntry): BalanceChange[] {
  if (c.type === GoalContributionType.OPENING) return [];
  if (!c.accountId) throw new Error(`${c.type} needs a wallet`);
  const amount = new Prisma.Decimal(c.amount);
  const delta =
    c.type === GoalContributionType.DEPOSIT ? amount.negated() : amount;
  return [{ accountId: c.accountId, delta }];
}
