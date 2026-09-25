import { Injectable } from '@nestjs/common';
import { Prisma } from '@/generated/prisma/client';
import type { BalanceChange } from './ledger.calculator';

/**
 * The only writer of Account.currentBalance after a wallet is created.
 * Always runs inside the caller's interactive transaction and uses atomic
 * increments, so concurrent writes never read-modify-write a stale balance.
 */
@Injectable()
export class LedgerService {
  async apply(
    tx: Prisma.TransactionClient,
    changes: BalanceChange[],
  ): Promise<void> {
    // Lock accounts in a consistent order (sorted by id) rather than insertion
    // order, so two concurrent opposite-direction transfers can't deadlock.
    const ordered = [...changes].sort((a, b) =>
      a.accountId.localeCompare(b.accountId),
    );
    for (const { accountId, delta } of ordered) {
      await tx.account.update({
        where: { id: accountId },
        data: { currentBalance: { increment: delta } },
      });
    }
  }

  async shiftInitialBalance(
    tx: Prisma.TransactionClient,
    accountId: string,
    delta: Prisma.Decimal,
  ): Promise<void> {
    if (delta.isZero()) return;
    await tx.account.update({
      where: { id: accountId },
      data: {
        initialBalance: { increment: delta },
        currentBalance: { increment: delta },
      },
    });
  }
}
