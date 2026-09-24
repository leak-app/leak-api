import type { PrismaService } from '@/common/prisma.service';
import { SpendOutcome, TransactionType } from '@/generated/prisma/client';
import { TransactionService } from './transactions.service';
import { outcomeFilterSchema } from './dto/transactions.dto';

/* eslint-disable @typescript-eslint/no-unsafe-assignment */

describe('TransactionService', () => {
  const userId = 'user-1';
  let prisma: {
    transaction: { findMany: jest.Mock; count: jest.Mock; update: jest.Mock };
    category: { findFirst: jest.Mock };
  };
  let service: TransactionService;

  beforeEach(() => {
    prisma = {
      transaction: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        update: jest.fn().mockResolvedValue({}),
      },
      category: { findFirst: jest.fn().mockResolvedValue({ id: 'c1' }) },
    };
    service = new TransactionService(prisma as unknown as PrismaService);
  });

  it('filters by outcome when provided', async () => {
    await service.findAll(userId, { outcome: SpendOutcome.LEAK });
    expect(prisma.transaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId,
          outcome: SpendOutcome.LEAK,
          type: TransactionType.EXPENSE,
        },
      }),
    );
  });

  it('defaults outcome-filtered queries to expenses only, without overriding an explicit type', async () => {
    await service.findAll(userId, {
      outcome: SpendOutcome.UNREVIEWED,
    });
    expect(prisma.transaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId,
          outcome: SpendOutcome.UNREVIEWED,
          type: TransactionType.EXPENSE,
        },
      }),
    );
  });

  it('does not filter by outcome when absent', async () => {
    await service.findAll(userId, {});
    expect(prisma.transaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId } }),
    );
  });

  it('resets outcome fields when an expense becomes an income', async () => {
    await service.update(userId, 't1', { type: TransactionType.INCOME });
    expect(prisma.transaction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 't1', userId },
        data: expect.objectContaining({
          type: TransactionType.INCOME,
          outcome: SpendOutcome.UNREVIEWED,
          leakReason: null,
          reviewedAt: null,
        } as any),
      } as any),
    );
  });

  it('leaves outcome fields alone for other updates', async () => {
    await service.update(userId, 't1', { amount: 50_000 });
    const { data } = (prisma.transaction.update.mock.calls[0] as any[])[0];
    expect(data).not.toHaveProperty('outcome');
  });

  it('rejects an unknown outcome filter value', () => {
    expect(outcomeFilterSchema.safeParse('WASTED').success).toBe(false);
    expect(outcomeFilterSchema.safeParse(undefined).success).toBe(true);
    expect(outcomeFilterSchema.safeParse('LEAK').success).toBe(true);
  });
});
