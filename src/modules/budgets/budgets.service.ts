import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/common/prisma.service';
import { CategoryType, TransactionType } from '@/generated/prisma/client';
import dayjs from 'dayjs';
import type { QueryBudgetDto, UpsertBudgetDto } from './dto/budgets.dto';

@Injectable()
export class BudgetsService {
  constructor(private readonly _prisma: PrismaService) {}

  async findAll(userId: string, query: QueryBudgetDto) {
    const month =
      query.month != null ? Number(query.month) : dayjs().month() + 1;
    const year = query.year != null ? Number(query.year) : dayjs().year();

    const budgets = await this._prisma.budget.findMany({
      where: {
        userId,
        month,
        year,
      },
      include: {
        category: true,
      },
      orderBy: {
        category: {
          name: 'asc',
        },
      },
    });

    return budgets.map((b) => ({
      id: b.id,
      amount: Number(b.amount),
      month: b.month,
      year: b.year,
      categoryId: b.categoryId,
      category: b.category
        ? {
            id: b.category.id,
            name: b.category.name,
            emoji: b.category.emoji,
            type: b.category.type,
          }
        : null,
      createdAt: b.createdAt.toISOString(),
      updatedAt: b.updatedAt.toISOString(),
    }));
  }

  async upsert(userId: string, dto: UpsertBudgetDto) {
    const category = await this._prisma.category.findFirst({
      where: { id: dto.categoryId, userId },
    });

    if (!category) {
      throw new NotFoundException('Danh mục không tồn tại');
    }

    const budget = await this._prisma.budget.upsert({
      where: {
        userId_categoryId_month_year: {
          userId,
          categoryId: dto.categoryId,
          month: dto.month,
          year: dto.year,
        },
      },
      create: {
        userId,
        categoryId: dto.categoryId,
        amount: dto.amount,
        month: dto.month,
        year: dto.year,
      },
      update: {
        amount: dto.amount,
      },
      include: {
        category: true,
      },
    });

    return {
      id: budget.id,
      amount: Number(budget.amount),
      month: budget.month,
      year: budget.year,
      categoryId: budget.categoryId,
      category: {
        id: budget.category.id,
        name: budget.category.name,
        emoji: budget.category.emoji,
        type: budget.category.type,
      },
      createdAt: budget.createdAt.toISOString(),
      updatedAt: budget.updatedAt.toISOString(),
    };
  }

  async delete(userId: string, id: string) {
    const budget = await this._prisma.budget.findFirst({
      where: { id, userId },
    });

    if (!budget) {
      throw new NotFoundException('Ngân sách không tồn tại');
    }

    await this._prisma.budget.delete({
      where: { id },
    });

    return { message: 'Xóa ngân sách thành công' };
  }

  async getReport(userId: string, query: QueryBudgetDto) {
    const month =
      query.month != null ? Number(query.month) : dayjs().month() + 1;
    const year = query.year != null ? Number(query.year) : dayjs().year();

    const startDate = dayjs()
      .year(year)
      .month(month - 1)
      .startOf('month')
      .toDate();
    const endDate = dayjs()
      .year(year)
      .month(month - 1)
      .endOf('month')
      .toDate();

    // 1. Fetch all expense categories for the user
    const categories = await this._prisma.category.findMany({
      where: {
        userId,
        type: CategoryType.EXPENSE,
        isDeleted: false,
      },
    });

    // 2. Fetch existing budget entries for month/year
    const budgets = await this._prisma.budget.findMany({
      where: {
        userId,
        month,
        year,
      },
    });
    const budgetMap = new Map<string, number>();
    for (const b of budgets) {
      budgetMap.set(b.categoryId, Number(b.amount));
    }

    // 3. Fetch transaction expenses grouped by category
    const spentGrouped = await this._prisma.transaction.groupBy({
      by: ['categoryId'],
      where: {
        userId,
        isDeleted: false,
        type: TransactionType.EXPENSE,
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      _sum: {
        amount: true,
      },
    });
    const spentMap = new Map<string, number>();
    for (const item of spentGrouped) {
      spentMap.set(
        item.categoryId,
        item._sum.amount ? Number(item._sum.amount) : 0,
      );
    }

    // 4. Combine categories report
    let totalBudget = 0;
    let totalSpent = 0;

    const categoryReports = categories.map((cat) => {
      const budgetAmount = budgetMap.get(cat.id) ?? 0;
      const spentAmount = spentMap.get(cat.id) ?? 0;
      const remainingAmount = budgetAmount - spentAmount;
      const percentage =
        budgetAmount > 0 ? Math.round((spentAmount / budgetAmount) * 100) : 0;
      const isWarning = percentage >= 80;

      totalBudget += budgetAmount;
      totalSpent += spentAmount;

      return {
        categoryId: cat.id,
        categoryName: cat.name,
        emoji: cat.emoji ?? null,
        budgetAmount,
        spentAmount,
        remainingAmount,
        percentage,
        isWarning,
      };
    });

    // Sort: categories with warnings or highest percentage first, then by name
    categoryReports.sort((a, b) => b.percentage - a.percentage);

    // 5. Generate automated savings insight
    let savingsInsight =
      'Hãy tiếp tục duy trì thói quen quản lý chi tiêu hiệu quả để đạt các mục tiêu tài chính của bạn.';

    const highUsageCategory = categoryReports.find(
      (c) => c.percentage >= 80 && c.budgetAmount > 0,
    );
    if (highUsageCategory) {
      if (highUsageCategory.percentage >= 100) {
        savingsInsight = `Danh mục '${highUsageCategory.categoryName}' đã vượt quá ngân sách! Hãy xem xét điều chỉnh các khoản chi khác.`;
      } else {
        savingsInsight = `Danh mục '${highUsageCategory.categoryName}' đã sử dụng ${highUsageCategory.percentage}% ngân sách. Bạn nên cắt giảm bớt chi tiêu cho danh mục này.`;
      }
    } else if (totalBudget > 0 && totalSpent / totalBudget < 0.5) {
      savingsInsight =
        'Tỷ lệ chi tiêu tháng này của bạn rất tối ưu. Bạn có thể trích thêm tiền vào mục tiêu tiết kiệm!';
    }

    return {
      month,
      year,
      totalBudget,
      totalSpent,
      categories: categoryReports,
      savingsInsight,
    };
  }
}
