import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@/common/prisma.service';
import { SpendOutcome, TransactionType } from '@/generated/prisma/client';
import {
  CreateTransactionDto,
  UpdateTransactionDto,
} from './dto/transactions.dto';
import { TransactionWhereInput } from '@/generated/prisma/models';

@Injectable()
export class TransactionService {
  constructor(private readonly _prisma: PrismaService) {}

  async findAll(
    userId: string,
    query: {
      search?: string;
      page?: number;
      limit?: number;
      type?: TransactionType;
      categoryId?: string;
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

    const where: TransactionWhereInput = { userId };

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
    const category = await this._prisma.category.findFirst({
      where: {
        id: dto.categoryId,
        userId,
      },
    });

    if (!category) {
      throw new BadRequestException(
        'Danh mục không tồn tại hoặc không thuộc về người dùng',
      );
    }

    return this._prisma.transaction.create({
      data: {
        amount: dto.amount,
        type: dto.type,
        categoryId: dto.categoryId,
        description: dto.description,
        userId,
      },
    });
  }

  async update(userId: string, id: string, dto: UpdateTransactionDto) {
    if (dto.categoryId) {
      const category = await this._prisma.category.findFirst({
        where: {
          id: dto.categoryId,
          userId,
        },
      });
      if (!category) {
        throw new BadRequestException(
          'Danh mục không tồn tại hoặc không thuộc về người dùng',
        );
      }
    }

    // Income is never reviewed, so an expense turned into income loses its outcome.
    const outcomeReset =
      dto.type === TransactionType.INCOME
        ? {
            outcome: SpendOutcome.UNREVIEWED,
            leakReason: null,
            reviewedAt: null,
          }
        : {};

    return this._prisma.transaction.update({
      where: {
        id,
        userId,
      },
      data: {
        amount: dto.amount,
        type: dto.type,
        categoryId: dto.categoryId,
        description: dto.description,
        ...outcomeReset,
      },
    });
  }

  async delete(userId: string, id: string) {
    return this._prisma.transaction.delete({
      where: {
        id,
        userId,
      },
    });
  }
}
