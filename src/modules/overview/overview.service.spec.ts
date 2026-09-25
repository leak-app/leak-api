import type { PrismaService } from '@/common/prisma.service';
import { OverviewService } from './overview.service';

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */

describe('OverviewService.getOverviewSummary', () => {
  const userId = 'user-1';
  let prisma: {
    account: { findMany: jest.Mock };
    transaction: { aggregate: jest.Mock; findMany: jest.Mock };
    goal: { findMany: jest.Mock; aggregate: jest.Mock };
  };
  let service: OverviewService;

  beforeEach(() => {
    prisma = {
      account: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { currentBalance: '100000.00' },
            { currentBalance: '50000.50' },
          ]),
      },
      transaction: {
        aggregate: jest
          .fn()
          .mockResolvedValue({ _sum: { amount: '999999.00' } }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      goal: {
        findMany: jest.fn().mockResolvedValue([]),
        aggregate: jest
          .fn()
          .mockResolvedValue({ _sum: { savedAmount: '2000000.00' } }),
      },
    };
    service = new OverviewService(prisma as unknown as PrismaService);
  });

  it('net worth is the sum of active wallet balances', async () => {
    const summary = await service.getOverviewSummary(userId);

    expect(prisma.account.findMany).toHaveBeenCalledWith({
      where: { userId, isDeleted: false },
    });
    expect(summary.totalBalance).toBe(2150000.5);
    expect(summary.accountsCount).toBe(2);
  });

  it('no longer falls back to income minus expense when wallets sum to zero', async () => {
    prisma.account.findMany.mockResolvedValue([{ currentBalance: '0.00' }]);
    prisma.goal.aggregate.mockResolvedValue({ _sum: { savedAmount: null } });
    const summary = await service.getOverviewSummary(userId);
    expect(summary.totalBalance).toBe(0);
  });

  it('net worth is wallets plus active goal savings', async () => {
    const summary = await service.getOverviewSummary(userId);
    expect(prisma.goal.aggregate).toHaveBeenCalledWith({
      where: { userId, isDeleted: false },
      _sum: { savedAmount: true },
    });
    expect(summary.walletsBalance).toBe(150000.5);
    expect(summary.goalsBalance).toBe(2000000);
    expect(summary.totalBalance).toBe(2150000.5);
  });

  it('goal progress excludes deleted goals', async () => {
    await service.getOverviewSummary(userId);
    expect(prisma.goal.findMany).toHaveBeenCalledWith({
      where: { userId, isDeleted: false },
    });
  });

  it('every transaction query excludes soft-deleted rows', async () => {
    await service.getOverviewSummary(userId);

    const calls = [
      ...prisma.transaction.aggregate.mock.calls,
      ...prisma.transaction.findMany.mock.calls,
    ];
    expect(calls.length).toBeGreaterThan(0);
    for (const [arg] of calls) {
      expect(arg.where).toMatchObject({ userId, isDeleted: false });
    }
  });
});
