import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@/common/prisma.service';
import { Prisma } from '@/generated/prisma/client';
import { LedgerService } from '@/modules/transactions/ledger.service';
import { CreateWalletDto, UpdateWalletDto } from './dto/wallets.dto';

@Injectable()
export class WalletService {
  constructor(
    private readonly _prisma: PrismaService,
    private readonly _ledger: LedgerService,
  ) {}

  async findAll(userId: string) {
    return this._prisma.account.findMany({
      where: { userId, isDeleted: false },
      orderBy: { createdAt: 'asc' },
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
      const wallet = await this._findActive(tx, userId, id);

      if (dto.initialBalance !== undefined) {
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

      // Lock the user's wallets so two concurrent archives cannot both pass the guard.
      await tx.$queryRaw`SELECT id FROM accounts WHERE user_id = ${userId} FOR UPDATE`;
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
