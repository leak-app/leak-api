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
}
