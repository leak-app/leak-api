import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@/common/prisma.service';
import {
  CategoryType,
  Prisma,
  SpendOutcome,
  TransactionType,
} from '@/generated/prisma/client';
import {
  CreateTransactionDto,
  UpdateTransactionDto,
} from './dto/transactions.dto';
import { TransactionWhereInput } from '@/generated/prisma/models';
import { LedgerService } from './ledger.service';
import { planBalanceChanges } from './ledger.calculator';
import { resolveOccurredAt } from './occurred-at';
import { WalletResolver } from './wallet-resolver.service';

const ALLOWED_CATEGORY_TYPES: Record<TransactionType, CategoryType[]> = {
  [TransactionType.INCOME]: [CategoryType.INCOME],
  [TransactionType.EXPENSE]: [CategoryType.EXPENSE, CategoryType.INVESTMENT],
};

@Injectable()
export class TransactionService {
  constructor(
    private readonly _prisma: PrismaService,
    private readonly _ledger: LedgerService,
    private readonly _wallets: WalletResolver,
  ) {}

  async findAll(
    userId: string,
    query: {
      search?: string;
      page?: number;
      limit?: number;
      type?: TransactionType;
      categoryId?: string;
      accountId?: string;
      outcome?: SpendOutcome;
      startDate?: string;
      endDate?: string;
      minAmount?: number;
      maxAmount?: number;
    },
  ) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const skip = (page - 1) * limit;

    const where: TransactionWhereInput = { userId, isDeleted: false };

    if (query.search?.trim()) {
      const searchTerm = query.search.trim();
      where.OR = [
        { description: { contains: searchTerm, mode: 'insensitive' } },
        { category: { name: { contains: searchTerm, mode: 'insensitive' } } },
      ];
    }

    if (query.type) {
      where.type = query.type;
    }
    if (query.categoryId) {
      where.categoryId = query.categoryId;
    }
    if (query.accountId) {
      where.accountId = query.accountId;
    }

    if (query.outcome) {
      where.outcome = query.outcome;
      // The "Chưa đánh giá" filter should only surface expenses: income rows
      // keep the default outcome (UNREVIEWED) but are never reviewable.
      if (!query.type) {
        where.type = TransactionType.EXPENSE;
      }
    }

    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) {
        where.createdAt.gte = new Date(query.startDate);
      }
      if (query.endDate) {
        where.createdAt.lte = new Date(query.endDate);
      }
    }

    if (query.minAmount !== undefined || query.maxAmount !== undefined) {
      where.amount = {};
      if (query.minAmount !== undefined) {
        where.amount.gte = query.minAmount;
      }
      if (query.maxAmount !== undefined) {
        where.amount.lte = query.maxAmount;
      }
    }

    const [transactions, total] = await Promise.all([
      this._prisma.transaction.findMany({
        where,
        include: {
          category: true,
          account: { select: { id: true, name: true, type: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this._prisma.transaction.count({ where }),
    ]);

    return {
      transactions,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async create(userId: string, dto: CreateTransactionDto) {
    // Reports read `createdAt` as the day of the transaction, so a past day goes there.
    const occurredAt = resolveOccurredAt(dto.occurredOn);
    return this._prisma.$transaction(async (tx) => {
      await this._assertCategory(tx, userId, dto.categoryId, dto.type);
      const accountId = await this._wallets.resolve(tx, userId, dto.accountId);

      const created = await tx.transaction.create({
        data: {
          amount: dto.amount,
          type: dto.type,
          categoryId: dto.categoryId,
          accountId,
          description: dto.description,
          userId,
          createdAt: occurredAt,
        },
      });

      await this._ledger.apply(tx, planBalanceChanges(null, created));
      return created;
    });
  }

  async update(userId: string, id: string, dto: UpdateTransactionDto) {
    return this._prisma.$transaction(async (tx) => {
      const existing = await this._lockActive(tx, userId, id);

      if (dto.type !== undefined || dto.categoryId !== undefined) {
        await this._assertCategory(
          tx,
          userId,
          dto.categoryId ?? existing.categoryId,
          dto.type ?? existing.type,
        );
      }

      // Only a *change* of wallet is validated, so rows in an archived wallet stay editable.
      const accountId =
        dto.accountId !== undefined && dto.accountId !== existing.accountId
          ? await this._wallets.resolveExplicit(tx, userId, dto.accountId)
          : existing.accountId;

      // Income is never reviewed, so an expense turned into income loses its outcome.
      const outcomeReset =
        dto.type === TransactionType.INCOME
          ? {
              outcome: SpendOutcome.UNREVIEWED,
              leakReason: null,
              reviewedAt: null,
            }
          : {};

      const updated = await tx.transaction.update({
        where: {
          id,
          userId,
        },
        data: {
          amount: dto.amount,
          type: dto.type,
          categoryId: dto.categoryId,
          accountId,
          description: dto.description,
          ...outcomeReset,
        },
      });

      await this._ledger.apply(tx, planBalanceChanges(existing, updated));
      return updated;
    });
  }

  async delete(userId: string, id: string) {
    return this._prisma.$transaction(async (tx) => {
      const existing = await this._lockActive(tx, userId, id);

      const deleted = await tx.transaction.update({
        where: { id, userId },
        data: { isDeleted: true, deletedAt: new Date() },
      });

      await this._ledger.apply(tx, planBalanceChanges(existing, null));
      return deleted;
    });
  }

  /**
   * Locks the row, then reads it. The lock makes concurrent edits or deletes of
   * the same transaction run one after another, so each sees the other's result
   * and a balance is never moved twice.
   */
  private async _lockActive(
    tx: Prisma.TransactionClient,
    userId: string,
    id: string,
  ) {
    await tx.$queryRaw`SELECT id FROM transactions WHERE id = ${id} AND user_id = ${userId} FOR UPDATE`;
    const existing = await tx.transaction.findFirst({
      where: { id, userId, isDeleted: false },
    });
    if (!existing) {
      throw new NotFoundException('Không tìm thấy giao dịch');
    }
    return existing;
  }

  private async _assertCategory(
    tx: Prisma.TransactionClient,
    userId: string,
    categoryId: string,
    type: TransactionType,
  ) {
    const category = await tx.category.findFirst({
      where: { id: categoryId, userId, isDeleted: false },
    });
    if (!category) {
      throw new BadRequestException(
        'Danh mục không tồn tại hoặc không thuộc về người dùng',
      );
    }
    if (!ALLOWED_CATEGORY_TYPES[type].includes(category.type)) {
      throw new BadRequestException(
        'Loại danh mục không khớp với loại giao dịch',
      );
    }
  }
}
