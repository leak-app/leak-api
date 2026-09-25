import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '@/common/prisma.service';
import {
  LeakReason,
  SpendOutcome,
  TransactionType,
} from '@/generated/prisma/client';
import { OutcomesService } from './outcomes.service';

function createPrismaMock() {
  return {
    transaction: {
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      groupBy: jest.fn(),
    },
    category: { findMany: jest.fn() },
  };
}

describe('OutcomesService', () => {
  const userId = 'user-1';
  const now = new Date('2026-09-24T12:00:00.000Z');
  let prisma: ReturnType<typeof createPrismaMock>;
  let service: OutcomesService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new OutcomesService(prisma as unknown as PrismaService);
  });

  describe('getQueue', () => {
    it('queries unreviewed expenses aged 24h (inclusive) to 7 days (exclusive), oldest first, max 5', async () => {
      prisma.transaction.findMany.mockResolvedValue([{ id: 't1' }]);
      prisma.transaction.count.mockResolvedValue(8);

      const result = await service.getQueue(userId, now);

      const expectedWhere = {
        userId,
        type: TransactionType.EXPENSE,
        outcome: SpendOutcome.UNREVIEWED,
        createdAt: {
          gt: new Date('2026-09-17T12:00:00.000Z'),
          lte: new Date('2026-09-23T12:00:00.000Z'),
        },
      };
      expect(prisma.transaction.findMany).toHaveBeenCalledWith({
        where: expectedWhere,
        include: { category: true },
        orderBy: { createdAt: 'asc' },
        take: 5,
      });
      expect(prisma.transaction.count).toHaveBeenCalledWith({
        where: expectedWhere,
      });
      expect(result).toEqual({ items: [{ id: 't1' }], total: 8 });
    });
  });

  describe('review', () => {
    it('throws NotFound when the transaction is missing or not owned', async () => {
      prisma.transaction.findFirst.mockResolvedValue(null);

      await expect(
        service.review(userId, 'missing', { outcome: 'WORTH_IT' }, now),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.transaction.findFirst).toHaveBeenCalledWith({
        where: { id: 'missing', userId },
      });
      expect(prisma.transaction.update).not.toHaveBeenCalled();
    });

    it('rejects income transactions', async () => {
      prisma.transaction.findFirst.mockResolvedValue({
        id: 't1',
        type: TransactionType.INCOME,
      });

      await expect(
        service.review(userId, 't1', { outcome: 'NEUTRAL' }, now),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.transaction.update).not.toHaveBeenCalled();
    });

    it('stores LEAK with its reason and the review time', async () => {
      prisma.transaction.findFirst.mockResolvedValue({
        id: 't1',
        type: TransactionType.EXPENSE,
      });
      prisma.transaction.update.mockResolvedValue({ id: 't1' });

      await service.review(
        userId,
        't1',
        { outcome: 'LEAK', leakReason: LeakReason.IMPULSIVE },
        now,
      );

      expect(prisma.transaction.update).toHaveBeenCalledWith({
        where: { id: 't1', userId },
        data: {
          outcome: SpendOutcome.LEAK,
          leakReason: LeakReason.IMPULSIVE,
          reviewedAt: now,
        },
        include: { category: true },
      });
    });

    it('stores LEAK without a reason as null', async () => {
      prisma.transaction.findFirst.mockResolvedValue({
        id: 't1',
        type: TransactionType.EXPENSE,
      });

      await service.review(userId, 't1', { outcome: 'LEAK' }, now);

      expect(prisma.transaction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            outcome: SpendOutcome.LEAK,
            leakReason: null,
            reviewedAt: now,
          },
        }),
      );
    });

    it('clears the leak reason for non-LEAK outcomes (re-rating)', async () => {
      prisma.transaction.findFirst.mockResolvedValue({
        id: 't1',
        type: TransactionType.EXPENSE,
        outcome: SpendOutcome.LEAK,
        leakReason: LeakReason.UNUSED,
      });

      await service.review(userId, 't1', { outcome: 'WORTH_IT' }, now);

      expect(prisma.transaction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            outcome: SpendOutcome.WORTH_IT,
            leakReason: null,
            reviewedAt: now,
          },
        }),
      );
    });
  });

  describe('getLeakRate', () => {
    it('queries the requested calendar month and converts Decimal sums', async () => {
      prisma.transaction.groupBy
        .mockResolvedValueOnce([
          {
            categoryId: 'c1',
            outcome: SpendOutcome.LEAK,
            _sum: { amount: '120000.00' },
            _count: { _all: 2 },
          },
        ])
        .mockResolvedValueOnce([
          {
            categoryId: 'c1',
            leakReason: LeakReason.IMPULSIVE,
            _sum: { amount: '120000.00' },
          },
        ]);
      prisma.category.findMany.mockResolvedValue([
        { id: 'c1', name: 'Cà phê', emoji: '☕' },
      ]);

      const report = await service.getLeakRate(userId, 2, 2026, now);

      const calls = prisma.transaction.groupBy.mock.calls as unknown[];
      const outcomeCall = calls[0] as unknown[];
      const reasonCall = calls[1] as unknown[];
      expect(outcomeCall[0]).toMatchObject({
        by: ['categoryId', 'outcome'],
        where: { userId, type: TransactionType.EXPENSE },
      });
      const arg0 = outcomeCall[0] as Record<string, Record<string, unknown>>;
      const where = arg0.where;
      const createdAt = where.createdAt as Record<string, Date>;
      const { gte, lte } = createdAt;
      expect(gte.getFullYear()).toBe(2026);
      expect(gte.getMonth()).toBe(1); // February
      expect(gte.getDate()).toBe(1);
      expect(lte.getMonth()).toBe(1);
      expect(lte.getDate()).toBe(28);
      expect(reasonCall[0]).toMatchObject({
        by: ['categoryId', 'leakReason'],
        where: { outcome: SpendOutcome.LEAK, leakReason: { not: null } },
      });
      expect(prisma.category.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['c1'] }, userId },
        select: { id: true, name: true, emoji: true },
      });
      expect(report.month).toBe(2);
      expect(report.categories[0]).toMatchObject({
        name: 'Cà phê',
        leakAmount: 120000,
        topLeakReason: LeakReason.IMPULSIVE,
      });
    });

    it('defaults to the current month and skips the category lookup when empty', async () => {
      prisma.transaction.groupBy.mockResolvedValue([]);

      const report = await service.getLeakRate(
        userId,
        undefined,
        undefined,
        new Date(2026, 0, 31, 10), // 31 Jan: must not overflow into March
      );

      expect(report).toMatchObject({ month: 1, year: 2026, categories: [] });
      expect(prisma.category.findMany).not.toHaveBeenCalled();
    });
  });
});
