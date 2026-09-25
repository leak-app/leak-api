import { BadRequestException, Injectable } from '@nestjs/common';
import { AccountType, Prisma } from '@/generated/prisma/client';

const WALLET_ERROR = 'Ví không tồn tại hoặc không thuộc về người dùng';

/** One wallet-selection rule for everything that moves money. */
@Injectable()
export class WalletResolver {
  /** Explicit wallet if given, else the default. Returns a locked, active wallet id. */
  async resolve(
    tx: Prisma.TransactionClient,
    userId: string,
    accountId?: string,
  ): Promise<string> {
    return accountId
      ? this.resolveExplicit(tx, userId, accountId)
      : this.defaultAccount(tx, userId);
  }

  async resolveExplicit(
    tx: Prisma.TransactionClient,
    userId: string,
    accountId: string,
  ): Promise<string> {
    const account = await tx.account.findFirst({
      where: { id: accountId, userId, isDeleted: false },
      select: { id: true },
    });
    if (!account || !(await this._lockIfActive(tx, account.id))) {
      throw new BadRequestException(WALLET_ERROR);
    }
    return account.id;
  }

  /**
   * Oldest active LIQUID wallet, else the oldest active wallet of any type.
   * Picks again once if the first pick is archived before it can be locked.
   */
  async defaultAccount(
    tx: Prisma.TransactionClient,
    userId: string,
  ): Promise<string> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const pick =
        (await tx.account.findFirst({
          where: { userId, isDeleted: false, type: AccountType.LIQUID },
          orderBy: { createdAt: 'asc' },
          select: { id: true },
        })) ??
        // The last-wallet guard in WalletService guarantees at least one active wallet.
        (await tx.account.findFirst({
          where: { userId, isDeleted: false },
          orderBy: { createdAt: 'asc' },
          select: { id: true },
        }));
      if (!pick) break;
      if (await this._lockIfActive(tx, pick.id)) return pick.id;
    }
    throw new BadRequestException(WALLET_ERROR);
  }

  /**
   * Key-share locks the wallet if it is still active. This waits for a
   * concurrent archive (which holds FOR UPDATE) and then re-checks is_deleted,
   * so money never lands in a wallet archived at the same moment.
   * KEY SHARE (not SHARE) does not conflict with the balance increment that
   * follows, so two writers on the same wallet cannot deadlock.
   */
  private async _lockIfActive(
    tx: Prisma.TransactionClient,
    accountId: string,
  ): Promise<boolean> {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM accounts WHERE id = ${accountId} AND is_deleted = false FOR KEY SHARE`;
    return rows.length > 0;
  }
}
