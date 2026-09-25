import type { PrismaService } from '@/common/prisma.service';
import { OverviewService } from './overview.service';

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */

describe('OverviewService.getOverviewSummary', () => {
  const userId = 'user-1';
  let prisma: {
    account: { findMany: jest.Mock };
    transaction: { aggregate: jest.Mock; findMany: jest.Mock };
    goal: { findMany: jest.Mock };
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
      goal: { findMany: jest.fn().mockResolvedValue([]) },
    };
    service = new OverviewService(prisma as unknown as PrismaService);
  });

  it('net worth is the sum of active wallet balances', async () => {
    const summary = await service.getOverviewSummary(userId);

    expect(prisma.account.findMany).toHaveBeenCalledWith({
      where: { userId, isDeleted: false },
    });
    expect(summary.totalBalance).toBe(150000.5);
    expect(summary.accountsCount).toBe(2);
  });

  it('no longer falls back to income minus expense when wallets sum to zero', async () => {
    prisma.account.findMany.mockResolvedValue([{ currentBalance: '0.00' }]);
    const summary = await service.getOverviewSummary(userId);
    expect(summary.totalBalance).toBe(0);
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
