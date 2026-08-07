import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/common/prisma.service';
import { TransactionType } from '@/generated/prisma/client';
import dayjs from 'dayjs';

@Injectable()
export class OverviewService {
  constructor(private readonly _prisma: PrismaService) {}

  private async _getSum(
    userId: string,
    type: TransactionType,
    startDate: Date,
    endDate: Date,
  ): Promise<number> {
    const result = await this._prisma.transaction.aggregate({
      where: {
        userId,
        type,
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      _sum: {
        amount: true,
      },
    });

    return result._sum.amount ? Number(result._sum.amount) : 0;
  }

  async getDailyReport(userId: string) {
    const todayStart = dayjs().startOf('day').toDate();
    const todayEnd = dayjs().endOf('day').toDate();
    const yesterdayStart = dayjs().subtract(1, 'day').startOf('day').toDate();
    const yesterdayEnd = dayjs().subtract(1, 'day').endOf('day').toDate();

    const [todayIncome, todayExpense, yesterdayIncome, yesterdayExpense] =
      await Promise.all([
        this._getSum(userId, TransactionType.INCOME, todayStart, todayEnd),
        this._getSum(userId, TransactionType.EXPENSE, todayStart, todayEnd),
        this._getSum(
          userId,
          TransactionType.INCOME,
          yesterdayStart,
          yesterdayEnd,
        ),
        this._getSum(
          userId,
          TransactionType.EXPENSE,
          yesterdayStart,
          yesterdayEnd,
        ),
      ]);

    return {
      today: { income: todayIncome, expense: todayExpense },
      yesterday: { income: yesterdayIncome, expense: yesterdayExpense },
    };
  }

  async getWeeklyReport(userId: string) {
    const thisWeekStart = dayjs().startOf('week').toDate();
    const thisWeekEnd = dayjs().endOf('week').toDate();
    const lastWeekStart = dayjs().subtract(1, 'week').startOf('week').toDate();
    const lastWeekEnd = dayjs().subtract(1, 'week').endOf('week').toDate();

    const [thisWeekIncome, thisWeekExpense, lastWeekIncome, lastWeekExpense] =
      await Promise.all([
        this._getSum(
          userId,
          TransactionType.INCOME,
          thisWeekStart,
          thisWeekEnd,
        ),
        this._getSum(
          userId,
          TransactionType.EXPENSE,
          thisWeekStart,
          thisWeekEnd,
        ),
        this._getSum(
          userId,
          TransactionType.INCOME,
          lastWeekStart,
          lastWeekEnd,
        ),
        this._getSum(
          userId,
          TransactionType.EXPENSE,
          lastWeekStart,
          lastWeekEnd,
        ),
      ]);

    return {
      currentWeek: { income: thisWeekIncome, expense: thisWeekExpense },
      previousWeek: { income: lastWeekIncome, expense: lastWeekExpense },
    };
  }

  async getMonthlyReport(userId: string) {
    const thisMonthStart = dayjs().startOf('month').toDate();
    const thisMonthEnd = dayjs().endOf('month').toDate();
    const lastMonthStart = dayjs()
      .subtract(1, 'month')
      .startOf('month')
      .toDate();
    const lastMonthEnd = dayjs().subtract(1, 'month').endOf('month').toDate();

    const [
      thisMonthIncome,
      thisMonthExpense,
      lastMonthIncome,
      lastMonthExpense,
    ] = await Promise.all([
      this._getSum(
        userId,
        TransactionType.INCOME,
        thisMonthStart,
        thisMonthEnd,
      ),
      this._getSum(
        userId,
        TransactionType.EXPENSE,
        thisMonthStart,
        thisMonthEnd,
      ),
      this._getSum(
        userId,
        TransactionType.INCOME,
        lastMonthStart,
        lastMonthEnd,
      ),
      this._getSum(
        userId,
        TransactionType.EXPENSE,
        lastMonthStart,
        lastMonthEnd,
      ),
    ]);

    return {
      currentMonth: { income: thisMonthIncome, expense: thisMonthExpense },
      previousMonth: { income: lastMonthIncome, expense: lastMonthExpense },
    };
  }

  private async _getTotalBalanceAndGrowth(userId: string) {
    const accounts = await this._prisma.account.findMany({
      where: { userId },
    });
    const accountsCount = accounts.length;
    const totalAccountBalance = accounts.reduce(
      (sum, acc) => sum + Number(acc.currentBalance),
      0,
    );

    const [allIncomeResult, allExpenseResult] = await Promise.all([
      this._prisma.transaction.aggregate({
        where: { userId, type: TransactionType.INCOME },
        _sum: { amount: true },
      }),
      this._prisma.transaction.aggregate({
        where: { userId, type: TransactionType.EXPENSE },
        _sum: { amount: true },
      }),
    ]);
    const totalIncome = Number(allIncomeResult._sum.amount || 0);
    const totalExpense = Number(allExpenseResult._sum.amount || 0);
    const netTransactionBalance = totalIncome - totalExpense;

    const totalBalance =
      totalAccountBalance > 0 ? totalAccountBalance : netTransactionBalance;

    // Income growth percentage vs previous month
    const thisMonthStart = dayjs().startOf('month').toDate();
    const thisMonthEnd = dayjs().endOf('month').toDate();
    const lastMonthStart = dayjs()
      .subtract(1, 'month')
      .startOf('month')
      .toDate();
    const lastMonthEnd = dayjs().subtract(1, 'month').endOf('month').toDate();

    const [currentMonthIncome, previousMonthIncome] = await Promise.all([
      this._getSum(
        userId,
        TransactionType.INCOME,
        thisMonthStart,
        thisMonthEnd,
      ),
      this._getSum(
        userId,
        TransactionType.INCOME,
        lastMonthStart,
        lastMonthEnd,
      ),
    ]);

    const growthPercentage =
      previousMonthIncome > 0
        ? Number(
            (
              ((currentMonthIncome - previousMonthIncome) /
                previousMonthIncome) *
              100
            ).toFixed(1),
          )
        : 0;

    return { totalBalance, growthPercentage, accountsCount };
  }

  private async _getWeeklyExpenseSummary(userId: string) {
    const dayLabels = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
    const now = dayjs();
    const monday = now.startOf('week').add(1, 'day');

    const dayPromises = dayLabels.map(async (label, index) => {
      const dayStart = monday.add(index, 'day').startOf('day').toDate();
      const dayEnd = monday.add(index, 'day').endOf('day').toDate();
      const sum = await this._getSum(
        userId,
        TransactionType.EXPENSE,
        dayStart,
        dayEnd,
      );
      return { dayLabel: label, amount: sum };
    });

    const daysData = await Promise.all(dayPromises);
    const maxAmount = Math.max(...daysData.map((d) => d.amount), 0);

    const weeklyDays = daysData.map((d) => {
      const percentage =
        maxAmount > 0 ? Math.round((d.amount / maxAmount) * 100) : 0;

      return {
        ...d,
        percentage,
        isPeak: maxAmount > 0 ? d.amount === maxAmount : false,
      };
    });

    const totalWeeklyExpense = weeklyDays.reduce((s, d) => s + d.amount, 0);

    return {
      totalAmount: totalWeeklyExpense,
      days: weeklyDays,
    };
  }

  private async _getRecentExpenses(userId: string, limit = 3) {
    const recentTx = await this._prisma.transaction.findMany({
      where: { userId, type: TransactionType.EXPENSE },
      include: { category: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return recentTx.map((tx) => ({
      id: tx.id,
      description: tx.description || tx.category?.name || '',
      amount: Number(tx.amount),
      createdAt: tx.createdAt.toISOString(),
      category: tx.category
        ? {
            name: tx.category.name,
            emoji: tx.category.emoji,
          }
        : undefined,
    }));
  }

  private async _getBudgetGoals(userId: string) {
    const goals = await this._prisma.goal.findMany({
      where: { userId },
    });

    return goals.map((g) => {
      const target = Number(g.targetAmount);
      const saved = Number(g.savedAmount);
      const percentage = target > 0 ? Math.round((saved / target) * 100) : 0;
      return {
        id: g.id,
        name: g.name,
        targetAmount: target,
        savedAmount: saved,
        percentage,
        isWarning: percentage >= 85,
      };
    });
  }

  async getOverviewSummary(userId: string) {
    const [balanceData, weeklyExpense, recentExpenses, budgetGoals] =
      await Promise.all([
        this._getTotalBalanceAndGrowth(userId),
        this._getWeeklyExpenseSummary(userId),
        this._getRecentExpenses(userId),
        this._getBudgetGoals(userId),
      ]);

    return {
      ...balanceData,
      weeklyExpense,
      recentExpenses,
      budgetGoals,
    };
  }
}
