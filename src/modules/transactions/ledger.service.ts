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
    for (const { accountId, delta } of changes) {
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
