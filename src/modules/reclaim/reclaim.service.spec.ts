import { ConflictException } from '@nestjs/common';
import type { PrismaService } from '@/common/prisma.service';
import {
  GoalContributionSource,
  LeakReclaimStatus,
  Prisma,
  SpendOutcome,
} from '@/generated/prisma/client';
import type { GoalService } from '@/modules/goals/goals.service';
import { ReclaimService } from './reclaim.service';

const userId = 'u1';
const NOW = new Date(2026, 9, 5, 9); // 5 Oct 2026 → target September
const { LEAK, WORTH_IT } = SpendOutcome;

const tx = (
  categoryId: string,
  amount: number,
  outcome: SpendOutcome,
  month: number,
) => ({
  categoryId,
  amount: new Prisma.Decimal(amount),
  outcome,
  createdAt: new Date(2026, month - 1, 10, 12),
});

/** June–August: 1tr coffee leak each; September: 400k coffee leak, all reviewed. */
const ROWS = [
  ...[6, 7, 8].flatMap((m) => [
    tx('coffee', 1000000, LEAK, m),
    tx('food', 500000, WORTH_IT, m),
  ]),
  tx('coffee', 400000, LEAK, 9),
  tx('food', 600000, WORTH_IT, 9),
];

const uniqueViolation = () =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  });

function createPrismaMock() {
  const prisma = {
    $transaction: jest.fn(),
    transaction: { findMany: jest.fn().mockResolvedValue(ROWS) },
    category: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'coffee', name: 'Cà phê', emoji: '☕' },
        { id: 'food', name: 'Ăn uống', emoji: '🍜' },
      ]),
    },
    goal: { findMany: jest.fn().mockResolvedValue([]) },
    goalContribution: { findFirst: jest.fn().mockResolvedValue(null) },
    leakReclaim: {
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(({ data }) => Promise.resolve({ id: 'r1', ...data })),
      update: jest.fn(({ data }) => Promise.resolve({ id: 'r1', ...data })),
    },
  };
  prisma.$transaction.mockImplementation((fn: (t: unknown) => unknown) =>
    fn(prisma),
  );
  return prisma;
}

describe('ReclaimService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let goals: { moveInTx: jest.Mock };
  let service: ReclaimService;

  beforeEach(() => {
    prisma = createPrismaMock();
    goals = {
      moveInTx: jest
        .fn()
        .mockResolvedValue({ goal: { id: 'g1' }, contribution: { id: 'c1' } }),
    };
    service = new ReclaimService(
      prisma as unknown as PrismaService,
      goals as unknown as GoalService,
    );
  });

  describe('getOffer', () => {
    it('loads June–September expenses and returns the OPEN offer', async () => {
      const offer = await service.getOffer(userId, NOW);

      expect(prisma.transaction.findMany).toHaveBeenCalledWith({
        where: {
          userId,
          isDeleted: false,
          type: 'EXPENSE',
          createdAt: {
            gte: new Date(2026, 5, 1),
            lte: new Date(2026, 8, 30, 23, 59, 59, 999),
          },
        },
        select: {
          categoryId: true,
          amount: true,
          outcome: true,
          createdAt: true,
        },
      });
      expect(offer).toMatchObject({
        year: 2026,
        month: 9,
        status: 'OPEN',
        reason: null,
        reclaimableAmount: 600000,
        coverage: 1,
        topCategory: {
          id: 'coffee',
          name: 'Cà phê',
          emoji: '☕',
          delta: 600000,
        },
      });
      expect(offer.breakdown[0]).toEqual({
        categoryId: 'coffee',
        name: 'Cà phê',
        emoji: '☕',
        baseline: 1000000,
        actual: 400000,
        delta: 600000,
      });
    });

    it('reports the stored decision for the month', async () => {
      prisma.leakReclaim.findUnique.mockResolvedValue({
        status: LeakReclaimStatus.DISMISSED,
      });
      expect((await service.getOffer(userId, NOW)).status).toBe('DISMISSED');
      expect(prisma.leakReclaim.findUnique).toHaveBeenCalledWith({
        where: { userId_year_month: { userId, year: 2026, month: 9 } },
      });
    });

    it('INELIGIBLE with the reason when history is too short', async () => {
      prisma.transaction.findMany.mockResolvedValue([
        tx('coffee', 400000, LEAK, 9),
      ]);
      expect(await service.getOffer(userId, NOW)).toMatchObject({
        status: 'INELIGIBLE',
        reason: 'NOT_ENOUGH_HISTORY',
      });
    });

    it('default goal: last reclaim deposit, then last deposit, then first unfinished goal, then null', async () => {
      prisma.goalContribution.findFirst.mockResolvedValueOnce({
        goalId: 'g-reclaim',
      });
      expect((await service.getOffer(userId, NOW)).defaultGoalId).toBe(
        'g-reclaim',
      );

      prisma.goalContribution.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ goalId: 'g-deposit' });
      expect((await service.getOffer(userId, NOW)).defaultGoalId).toBe(
        'g-deposit',
      );

      prisma.goal.findMany.mockResolvedValueOnce([
        {
          id: 'done',
          savedAmount: new Prisma.Decimal(5),
          targetAmount: new Prisma.Decimal(5),
        },
        {
          id: 'open',
          savedAmount: new Prisma.Decimal(1),
          targetAmount: new Prisma.Decimal(5),
        },
      ]);
      expect((await service.getOffer(userId, NOW)).defaultGoalId).toBe('open');

      expect((await service.getOffer(userId, NOW)).defaultGoalId).toBeNull();
    });
  });

  describe('transfer', () => {
    const dto = { goalId: 'g1', amount: 500000 };

    it('records the month, deposits with LEAK_RECLAIM inside the same tx, links the contribution', async () => {
      const result = await service.transfer(userId, dto, NOW);

      expect(prisma.leakReclaim.create).toHaveBeenCalledWith({
        data: {
          userId,
          year: 2026,
          month: 9,
          computedAmount: new Prisma.Decimal(600000),
          transferAmount: new Prisma.Decimal(500000),
          status: LeakReclaimStatus.TRANSFERRED,
        },
      });
      expect(goals.moveInTx).toHaveBeenCalledWith(
        prisma,
        userId,
        'g1',
        {
          amount: 500000,
          accountId: undefined,
          note: 'Bịt rò rỉ tháng 9/2026',
        },
        'DEPOSIT',
        GoalContributionSource.LEAK_RECLAIM,
      );
      expect(prisma.leakReclaim.update).toHaveBeenCalledWith({
        where: { id: 'r1' },
        data: { contributionId: 'c1' },
      });
      expect(result.goal).toEqual({ id: 'g1' });
    });

    it('409 when the month is not eligible (recomputed server-side)', async () => {
      prisma.transaction.findMany.mockResolvedValue([]);
      await expect(service.transfer(userId, dto, NOW)).rejects.toThrow(
        new ConflictException(
          'Không còn khoản tiền nào để chuyển cho tháng này',
        ),
      );
      expect(goals.moveInTx).not.toHaveBeenCalled();
    });

    it('409 when this month was already transferred or dismissed', async () => {
      prisma.leakReclaim.findUnique.mockResolvedValueOnce({
        status: LeakReclaimStatus.TRANSFERRED,
      });
      await expect(service.transfer(userId, dto, NOW)).rejects.toThrow(
        new ConflictException('Bạn đã chuyển tiền cho tháng này rồi'),
      );
      prisma.leakReclaim.findUnique.mockResolvedValueOnce({
        status: LeakReclaimStatus.DISMISSED,
      });
      await expect(service.transfer(userId, dto, NOW)).rejects.toThrow(
        new ConflictException('Bạn đã bỏ qua đề xuất của tháng này'),
      );
      expect(goals.moveInTx).not.toHaveBeenCalled();
    });

    it('maps a concurrent insert (P2002) to 409', async () => {
      prisma.leakReclaim.create.mockRejectedValueOnce(uniqueViolation());
      await expect(service.transfer(userId, dto, NOW)).rejects.toThrow(
        new ConflictException('Bạn đã chuyển tiền cho tháng này rồi'),
      );
      expect(goals.moveInTx).not.toHaveBeenCalled();
    });

    it('a failing deposit propagates and never links a contribution', async () => {
      goals.moveInTx.mockRejectedValueOnce(
        new Error('Không tìm thấy mục tiêu'),
      );
      await expect(service.transfer(userId, dto, NOW)).rejects.toThrow(
        'Không tìm thấy mục tiêu',
      );
      expect(prisma.leakReclaim.update).not.toHaveBeenCalled();
    });
  });

  describe('dismiss', () => {
    it('stores DISMISSED with the computed amount', async () => {
      await expect(service.dismiss(userId, NOW)).resolves.toEqual({
        status: 'DISMISSED',
      });
      expect(prisma.leakReclaim.create).toHaveBeenCalledWith({
        data: {
          userId,
          year: 2026,
          month: 9,
          computedAmount: new Prisma.Decimal(600000),
          status: LeakReclaimStatus.DISMISSED,
        },
      });
    });

    it('is idempotent: an existing decision is returned, a racing insert is re-read', async () => {
      prisma.leakReclaim.findUnique.mockResolvedValueOnce({
        status: LeakReclaimStatus.TRANSFERRED,
      });
      await expect(service.dismiss(userId, NOW)).resolves.toEqual({
        status: 'TRANSFERRED',
      });

      prisma.leakReclaim.create.mockRejectedValueOnce(uniqueViolation());
      prisma.leakReclaim.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ status: LeakReclaimStatus.DISMISSED });
      await expect(service.dismiss(userId, NOW)).resolves.toEqual({
        status: 'DISMISSED',
      });
    });
  });

  it('history: leak and reclaimed amounts per completed month, oldest first', async () => {
    prisma.leakReclaim.findMany.mockResolvedValue([
      { year: 2026, month: 9, transferAmount: new Prisma.Decimal(500000) },
    ]);
    expect(await service.getHistory(userId, 2, NOW)).toEqual([
      { year: 2026, month: 8, leakAmount: 1000000, reclaimedAmount: 0 },
      { year: 2026, month: 9, leakAmount: 400000, reclaimedAmount: 500000 },
    ]);
    expect(prisma.leakReclaim.findMany).toHaveBeenCalledWith({
      where: { userId, status: LeakReclaimStatus.TRANSFERRED },
    });
  });
});
