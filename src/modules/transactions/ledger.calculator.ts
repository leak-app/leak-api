import { Prisma, TransactionType } from '@/generated/prisma/client';

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
