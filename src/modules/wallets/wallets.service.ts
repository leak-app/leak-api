import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@/common/prisma.service';
import { AccountType, Prisma } from '@/generated/prisma/client';
import { LedgerService } from '@/modules/transactions/ledger.service';
import { ValuationsService } from '@/modules/valuations/valuations.service';
import { CreateWalletDto, UpdateWalletDto } from './dto/wallets.dto';

@Injectable()
export class WalletService {
  constructor(
    private readonly _prisma: PrismaService,
    private readonly _ledger: LedgerService,
    private readonly _valuations: ValuationsService,
  ) {}

  /** Investment wallets also carry their profit figures; other wallets get `valuation: null`. */
  async findAll(userId: string) {
    const wallets = await this._prisma.account.findMany({
      where: { userId, isDeleted: false },
      orderBy: { createdAt: 'asc' },
    });
    const summaries = await this._valuations.summarize(userId, wallets);
    return wallets.map((wallet) => ({
      ...wallet,
      valuation: summaries.get(wallet.id) ?? null,
    }));
  }

  /** Id and name of active wallets. Skips the valuation work `findAll` does. */
  async findOptions(userId: string) {
    return this._prisma.account.findMany({
      where: { userId, isDeleted: false },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true },
    });
  }

  async create(userId: string, dto: CreateWalletDto) {
    return this._prisma.account.create({
      data: {
        name: dto.name,
        type: dto.type,
        initialBalance: dto.initialBalance,
        currentBalance: dto.initialBalance, // Initially set to initial balance
        userId,
      },
    });
  }

  async update(userId: string, id: string, dto: UpdateWalletDto) {
    return this._prisma.$transaction(async (tx) => {
      // Lock the row before reading it, so a concurrent update can't read the same
      // stale initialBalance and compute an overlapping delta.
      await tx.$queryRaw`SELECT id FROM accounts WHERE id = ${id} AND user_id = ${userId} FOR UPDATE`;
      const wallet = await this._findActive(tx, userId, id);

      if (dto.initialBalance !== undefined) {
        await this._assertOpeningBalanceEditable(tx, wallet);
        await this._ledger.shiftInitialBalance(
          tx,
          id,
          new Prisma.Decimal(dto.initialBalance).minus(wallet.initialBalance),
        );
      }

      return tx.account.update({
        where: { id },
        data: { name: dto.name },
      });
    });
  }

  /** Archives the wallet. Its transactions and balance are kept for history. */
  async delete(userId: string, id: string) {
    return this._prisma.$transaction(async (tx) => {
      await this._findActive(tx, userId, id);

      // Lock the user's wallets, in a stable order, so two concurrent archives
      // cannot both pass the guard and cannot deadlock against each other.
      await tx.$queryRaw`SELECT id FROM accounts WHERE user_id = ${userId} ORDER BY id FOR UPDATE`;
      const otherActive = await tx.account.count({
        where: { userId, isDeleted: false, id: { not: id } },
      });
      if (otherActive === 0) {
        throw new ConflictException('Không thể lưu trữ ví cuối cùng');
      }

      return tx.account.update({
        where: { id },
        data: { isDeleted: true, deletedAt: new Date() },
      });
    });
  }

  /**
   * Once an investment wallet has balance updates, its opening balance is the
   * start of the profit maths. Moving it would silently turn profit into capital.
   */
  private async _assertOpeningBalanceEditable(
    tx: Prisma.TransactionClient,
    wallet: { id: string; type: AccountType },
  ) {
    if (wallet.type !== AccountType.INVESTMENT) return;
    const updates = await tx.accountValuation.count({
      where: { accountId: wallet.id, isDeleted: false },
    });
    if (updates > 0) {
      throw new ConflictException(
        'Ví đầu tư đã có cập nhật số dư. Hãy dùng "Cập nhật số dư" để đổi số dư.',
      );
    }
  }

  private async _findActive(
    tx: Prisma.TransactionClient,
    userId: string,
    id: string,
  ) {
    const wallet = await tx.account.findFirst({
      where: { id, userId, isDeleted: false },
    });
    if (!wallet) {
      throw new NotFoundException('Không tìm thấy ví');
    }
    return wallet;
  }
}
