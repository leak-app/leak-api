import { ConflictException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '@/common/prisma.service';
import { GoalContributionType, Prisma } from '@/generated/prisma/client';
import type { LedgerService } from '@/modules/transactions/ledger.service';
import type { WalletResolver } from '@/modules/transactions/wallet-resolver.service';
import { GoalService } from './goals.service';

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */

const userId = 'user-1';
const goal = {
  id: 'g1',
  userId,
  name: 'Nhật Bản',
  targetAmount: new Prisma.Decimal(30000000),
  savedAmount: new Prisma.Decimal(1000000),
  isDeleted: false,
};

function createPrismaMock() {
  const prisma = {
    $transaction: jest.fn(),
    $queryRaw: jest.fn().mockResolvedValue([{ id: 'g1' }]),
    goal: {
      findMany: jest.fn().mockResolvedValue([goal]),
      findFirst: jest.fn().mockResolvedValue(goal),
      create: jest.fn(({ data }) => Promise.resolve({ id: 'new', ...data })),
      update: jest.fn(({ data }) => Promise.resolve({ ...goal, ...data })),
    },
    goalContribution: {
      create: jest.fn(({ data }) => Promise.resolve({ id: 'c1', ...data })),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
  };
  prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
    fn(prisma),
  );
  return prisma;
}

const rawSql = (mock: jest.Mock) =>
  mock.mock.calls.map((call) => (call[0] as string[]).join('?'));

const deltas = (changes: { accountId: string; delta: Prisma.Decimal }[]) =>
  changes.map((c) => [c.accountId, c.delta.toString()]);

describe('GoalService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let ledger: { apply: jest.Mock };
  let wallets: { resolve: jest.Mock };
  let service: GoalService;

  beforeEach(() => {
    prisma = createPrismaMock();
    ledger = { apply: jest.fn().mockResolvedValue(undefined) };
    wallets = { resolve: jest.fn().mockResolvedValue('cash') };
    service = new GoalService(
      prisma as unknown as PrismaService,
      ledger as unknown as LedgerService,
      wallets as unknown as WalletResolver,
    );
  });

  it('lists only active goals', async () => {
    await service.findAll(userId);
    expect(prisma.goal.findMany).toHaveBeenCalledWith({
      where: { userId, isDeleted: false },
      orderBy: { createdAt: 'asc' },
    });
  });

  it('creates a goal with a date-only target and no savedAmount', async () => {
    await service.create(userId, {
      name: 'Nhật',
      targetAmount: 1,
      targetDate: '2027-03-01',
    });
    expect(prisma.goal.create).toHaveBeenCalledWith({
      data: {
        name: 'Nhật',
        emoji: undefined,
        targetAmount: 1,
        targetDate: new Date('2027-03-01T00:00:00.000Z'),
        userId,
      },
    });
  });

  it('update with targetDate null clears it', async () => {
    await service.update(userId, 'g1', { targetDate: null });
    expect(prisma.goal.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ targetDate: null }),
      }),
    );
  });

  it('update 404s for a deleted or foreign goal', async () => {
    prisma.goal.findFirst.mockResolvedValue(null);
    await expect(service.update(userId, 'g1', { name: 'x' })).rejects.toThrow(
      new NotFoundException('Không tìm thấy mục tiêu'),
    );
    expect(prisma.goal.update).not.toHaveBeenCalled();
  });

  describe('deposit', () => {
    it('locks the goal, resolves the wallet, records, moves the wallet and the goal', async () => {
      const result = await service.deposit(userId, 'g1', {
        amount: 500000,
        note: 'Lương',
      });

      expect(rawSql(prisma.$queryRaw)[0]).toContain(
        'FROM goals WHERE id = ? AND user_id = ? FOR UPDATE',
      );
      expect(wallets.resolve).toHaveBeenCalledWith(prisma, userId, undefined);
      expect(prisma.goalContribution.create).toHaveBeenCalledWith({
        data: {
          goalId: 'g1',
          accountId: 'cash',
          userId,
          type: GoalContributionType.DEPOSIT,
          source: 'MANUAL',
          amount: new Prisma.Decimal(500000),
          note: 'Lương',
        },
      });
      expect(deltas(ledger.apply.mock.calls[0][1])).toEqual([
        ['cash', '-500000'],
      ]);
      expect(prisma.goal.update).toHaveBeenCalledWith({
        where: { id: 'g1' },
        data: { savedAmount: { increment: new Prisma.Decimal(500000) } },
      });
      expect(result.contribution.id).toBe('c1');
    });

    it('404 for a missing, deleted or foreign goal, before touching any wallet', async () => {
      prisma.goal.findFirst.mockResolvedValue(null);
      await expect(
        service.deposit(userId, 'nope', { amount: 1 }),
      ).rejects.toThrow(new NotFoundException('Không tìm thấy mục tiêu'));
      expect(wallets.resolve).not.toHaveBeenCalled();
    });

    it('writes nothing when the wallet cannot be resolved', async () => {
      wallets.resolve.mockRejectedValue(new Error('wallet'));
      await expect(
        service.deposit(userId, 'g1', { amount: 1, accountId: 'archived' }),
      ).rejects.toThrow('wallet');
      expect(prisma.goalContribution.create).not.toHaveBeenCalled();
      expect(ledger.apply).not.toHaveBeenCalled();
    });
  });

  describe('withdraw', () => {
    it('returns money to the wallet and decrements the goal', async () => {
      await service.withdraw(userId, 'g1', { amount: 200000, accountId: 'w2' });
      expect(wallets.resolve).toHaveBeenCalledWith(prisma, userId, 'w2');
      expect(deltas(ledger.apply.mock.calls[0][1])).toEqual([
        ['cash', '200000'],
      ]);
      expect(prisma.goal.update).toHaveBeenCalledWith({
        where: { id: 'g1' },
        data: { savedAmount: { decrement: new Prisma.Decimal(200000) } },
      });
    });

    it('allows withdrawing exactly the saved amount', async () => {
      await expect(
        service.withdraw(userId, 'g1', { amount: 1000000 }),
      ).resolves.toBeDefined();
    });

    it('409 when withdrawing more than saved', async () => {
      await expect(
        service.withdraw(userId, 'g1', { amount: 1000000.01 }),
      ).rejects.toThrow(
        new ConflictException('Số tiền rút vượt quá số đã tích lũy'),
      );
      expect(prisma.goalContribution.create).not.toHaveBeenCalled();
    });

    it('locks the goal row before reading it (concurrent withdrawals)', async () => {
      await service.withdraw(userId, 'g1', { amount: 1 });
      const lockOrder = prisma.$queryRaw.mock.invocationCallOrder[0];
      const readOrder = prisma.goal.findFirst.mock.invocationCallOrder[0];
      expect(lockOrder).toBeLessThan(readOrder);
    });
  });

  describe('delete', () => {
    it('409 while money remains', async () => {
      await expect(service.delete(userId, 'g1')).rejects.toThrow(
        new ConflictException('Hãy rút hết tiền trước khi xóa mục tiêu'),
      );
    });

    it('soft-deletes an empty goal', async () => {
      prisma.goal.findFirst.mockResolvedValue({
        ...goal,
        savedAmount: new Prisma.Decimal(0),
      });
      await service.delete(userId, 'g1');
      expect(prisma.goal.update).toHaveBeenCalledWith({
        where: { id: 'g1' },
        data: { isDeleted: true, deletedAt: expect.any(Date) },
      });
    });
  });

  it('contributions are paged newest first with the wallet name', async () => {
    await service.contributions(userId, 'g1', { page: 2, limit: 10 });
    expect(prisma.goalContribution.findMany).toHaveBeenCalledWith({
      where: { goalId: 'g1', userId },
      include: { account: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      skip: 10,
      take: 10,
    });
  });
});
