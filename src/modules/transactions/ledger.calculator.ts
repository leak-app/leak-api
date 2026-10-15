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

export type ValuationEntry = {
  accountId: string;
  adjustment: Prisma.Decimal | number | string;
};

/**
 * A balance update moves the wallet by the difference to what the user entered.
 * Undoing it passes `undo: true` and moves it back. A zero difference changes nothing.
 */
export function planValuationChanges(
  v: ValuationEntry,
  undo = false,
): BalanceChange[] {
  const adjustment = new Prisma.Decimal(v.adjustment);
  if (adjustment.isZero()) return [];
  return [
    {
      accountId: v.accountId,
      delta: undo ? adjustment.negated() : adjustment,
    },
  ];
}

export type TransferEntry = {
  fromAccountId: string;
  toAccountId: string;
  amount: Prisma.Decimal | number | string;
};

/**
 * A transfer takes the amount out of one wallet and puts it into the other.
 * Deleting it passes `undo: true` and moves the money back.
 */
export function planTransferChanges(
  t: TransferEntry,
  undo = false,
): BalanceChange[] {
  const amount = new Prisma.Decimal(t.amount);
  if (amount.isZero()) return [];
  const out = undo ? amount : amount.negated();
  return [
    { accountId: t.fromAccountId, delta: out },
    { accountId: t.toAccountId, delta: out.negated() },
  ];
}
