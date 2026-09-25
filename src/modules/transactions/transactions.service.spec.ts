import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '@/common/prisma.service';
import {
  AccountType,
  CategoryType,
  Prisma,
  SpendOutcome,
  TransactionType,
} from '@/generated/prisma/client';
import { TransactionService } from './transactions.service';
import type { LedgerService } from './ledger.service';
import type { BalanceChange } from './ledger.calculator';
import { outcomeFilterSchema } from './dto/transactions.dto';

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */

const userId = 'user-1';

const existing = {
  id: 't1',
  userId,
  accountId: 'cash',
  categoryId: 'c1',
  type: TransactionType.EXPENSE,
  amount: new Prisma.Decimal(50000),
  description: 'Phở',
  isDeleted: false,
};

function createPrismaMock() {
  const prisma = {
    $transaction: jest.fn(),
    $queryRaw: jest.fn().mockResolvedValue([{ id: 'locked' }]),
    transaction: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      findFirst: jest.fn().mockResolvedValue(existing),
      create: jest.fn(({ data }) => Promise.resolve({ id: 'new', ...data })),
      update: jest.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          ...existing,
          ...Object.fromEntries(
            Object.entries(data).filter(([, v]) => v !== undefined),
          ),
        }),
      ),
    },
    category: {
      findFirst: jest
        .fn()
        .mockResolvedValue({ id: 'c1', type: CategoryType.EXPENSE }),
    },
    account: {
      findFirst: jest.fn().mockResolvedValue({ id: 'cash' }),
    },
  };
  prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
    fn(prisma),
  );
  return prisma;
}

/** SQL text of every `$queryRaw` tagged-template call, in call order. */
const rawSql = (mock: jest.Mock) =>
  mock.mock.calls.map((call) => (call[0] as string[]).join('?'));

describe('TransactionService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let ledger: { apply: jest.Mock };
  let service: TransactionService;

  const appliedChanges = () =>
    (ledger.apply.mock.calls[0][1] as BalanceChange[]).map((c) => ({
      accountId: c.accountId,
      delta: c.delta.toString(),
    }));

  beforeEach(() => {
    prisma = createPrismaMock();
    ledger = { apply: jest.fn().mockResolvedValue(undefined) };
    service = new TransactionService(
      prisma as unknown as PrismaService,
      ledger as unknown as LedgerService,
    );
  });

  describe('findAll', () => {
    it('excludes soft-deleted rows and includes the wallet', async () => {
      await service.findAll(userId, {});
      expect(prisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId, isDeleted: false },
          include: {
            category: true,
            account: { select: { id: true, name: true, type: true } },
          },
        }),
      );
      expect(prisma.transaction.count).toHaveBeenCalledWith({
        where: { userId, isDeleted: false },
      });
    });

    it('filters by wallet inside the user scope', async () => {
      await service.findAll(userId, { accountId: 'wallet-2' });
      expect(prisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId, isDeleted: false, accountId: 'wallet-2' },
        }),
      );
      expect(prisma.transaction.count).toHaveBeenCalledWith({
        where: { userId, isDeleted: false, accountId: 'wallet-2' },
      });
    });

    it('filters by outcome and defaults to expenses only', async () => {
      await service.findAll(userId, { outcome: SpendOutcome.LEAK });
      expect(prisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId,
            isDeleted: false,
            outcome: SpendOutcome.LEAK,
            type: TransactionType.EXPENSE,
          },
        }),
      );
    });

    it('rejects an unknown outcome filter value', () => {
      expect(outcomeFilterSchema.safeParse('WASTED').success).toBe(false);
      expect(outcomeFilterSchema.safeParse(undefined).success).toBe(true);
      expect(outcomeFilterSchema.safeParse('LEAK').success).toBe(true);
    });
  });

  describe('create', () => {
    const dto = {
      amount: 50000,
      type: TransactionType.EXPENSE,
      categoryId: 'c1',
    };

    it('uses the oldest active LIQUID wallet when accountId is omitted', async () => {
      await service.create(userId, dto);

      expect(prisma.account.findFirst).toHaveBeenCalledWith({
        where: { userId, isDeleted: false, type: AccountType.LIQUID },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      expect(prisma.transaction.create).toHaveBeenCalledWith({
        data: {
          amount: 50000,
          type: TransactionType.EXPENSE,
          categoryId: 'c1',
          accountId: 'cash',
          description: undefined,
          userId,
        },
      });
      expect(ledger.apply.mock.calls[0][0]).toBe(prisma);
      expect(appliedChanges()).toEqual([
        { accountId: 'cash', delta: '-50000' },
      ]);
    });

    it('falls back to the oldest active wallet of any type when no LIQUID wallet is active', async () => {
      prisma.account.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'invest' });

      await service.create(userId, dto);

      expect(prisma.account.findFirst).toHaveBeenLastCalledWith({
        where: { userId, isDeleted: false },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      expect(appliedChanges()).toEqual([
        { accountId: 'invest', delta: '-50000' },
      ]);
    });

    it('uses the given wallet when it is the user’s active wallet', async () => {
      prisma.account.findFirst.mockResolvedValue({ id: 'bank' });

      await service.create(userId, { ...dto, accountId: 'bank' });

      expect(prisma.account.findFirst).toHaveBeenCalledWith({
        where: { id: 'bank', userId, isDeleted: false },
        select: { id: true },
      });
      expect(appliedChanges()).toEqual([
        { accountId: 'bank', delta: '-50000' },
      ]);
    });

    it('rejects a foreign or archived wallet', async () => {
      prisma.account.findFirst.mockResolvedValue(null);

      await expect(
        service.create(userId, { ...dto, accountId: 'other' }),
      ).rejects.toThrow(
        new BadRequestException(
          'Ví không tồn tại hoặc không thuộc về người dùng',
        ),
      );
      expect(prisma.transaction.create).not.toHaveBeenCalled();
      expect(ledger.apply).not.toHaveBeenCalled();
    });

    it('rejects a soft-deleted or foreign category', async () => {
      prisma.category.findFirst.mockResolvedValue(null);

      await expect(service.create(userId, dto)).rejects.toThrow(
        new BadRequestException(
          'Danh mục không tồn tại hoặc không thuộc về người dùng',
        ),
      );
      expect(prisma.category.findFirst).toHaveBeenCalledWith({
        where: { id: 'c1', userId, isDeleted: false },
      });
      expect(prisma.transaction.create).not.toHaveBeenCalled();
    });

    it('rejects income logged against an expense category', async () => {
      await expect(
        service.create(userId, { ...dto, type: TransactionType.INCOME }),
      ).rejects.toThrow(
        new BadRequestException('Loại danh mục không khớp với loại giao dịch'),
      );
    });

    it('rejects an expense logged against an income category', async () => {
      prisma.category.findFirst.mockResolvedValue({
        id: 'c1',
        type: CategoryType.INCOME,
      });
      await expect(service.create(userId, dto)).rejects.toThrow(
        new BadRequestException('Loại danh mục không khớp với loại giao dịch'),
      );
    });

    it('allows an expense against an INVESTMENT category', async () => {
      prisma.category.findFirst.mockResolvedValue({
        id: 'c1',
        type: CategoryType.INVESTMENT,
      });
      await expect(service.create(userId, dto)).resolves.toBeDefined();
    });
    it('key-share locks the chosen wallet before inserting', async () => {
      await service.create(userId, {
        amount: 50000,
        type: TransactionType.EXPENSE,
        categoryId: 'c1',
      });

      const lockIndex = rawSql(prisma.$queryRaw).findIndex((sql) =>
        sql.includes('FOR KEY SHARE'),
      );
      expect(lockIndex).toBeGreaterThanOrEqual(0);
      expect(prisma.$queryRaw.mock.calls[lockIndex][1]).toBe('cash');
      expect(prisma.$queryRaw.mock.invocationCallOrder[lockIndex]).toBeLessThan(
        prisma.transaction.create.mock.invocationCallOrder[0],
      );
    });

    it('rejects a given wallet that was archived between the check and the lock', async () => {
      prisma.account.findFirst.mockResolvedValue({ id: 'bank' });
      prisma.$queryRaw.mockResolvedValue([]);

      await expect(
        service.create(userId, {
          amount: 50000,
          type: TransactionType.EXPENSE,
          categoryId: 'c1',
          accountId: 'bank',
        }),
      ).rejects.toThrow(
        new BadRequestException(
          'Ví không tồn tại hoặc không thuộc về người dùng',
        ),
      );
      expect(prisma.transaction.create).not.toHaveBeenCalled();
      expect(ledger.apply).not.toHaveBeenCalled();
    });

    it('picks the default wallet again when the first pick was just archived', async () => {
      prisma.account.findFirst
        .mockResolvedValueOnce({ id: 'cash' })
        .mockResolvedValueOnce({ id: 'bank' });
      prisma.$queryRaw
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 'bank' }]);

      await service.create(userId, {
        amount: 50000,
        type: TransactionType.EXPENSE,
        categoryId: 'c1',
      });

      expect(prisma.transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ accountId: 'bank' }),
        }),
      );
      expect(appliedChanges()).toEqual([
        { accountId: 'bank', delta: '-50000' },
      ]);
    });
  });

  describe('update', () => {
    it('locks the row before reading it', async () => {
      await service.update(userId, 't1', { amount: 80000 });

      expect(prisma.$queryRaw).toHaveBeenCalled();
      expect(prisma.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.transaction.findFirst.mock.invocationCallOrder[0],
      );
      expect(prisma.transaction.findFirst).toHaveBeenCalledWith({
        where: { id: 't1', userId, isDeleted: false },
      });
    });

    it('throws NotFound for a missing or soft-deleted transaction', async () => {
      prisma.transaction.findFirst.mockResolvedValue(null);

      await expect(service.update(userId, 't1', { amount: 1 })).rejects.toThrow(
        new NotFoundException('Không tìm thấy giao dịch'),
      );
      expect(prisma.transaction.update).not.toHaveBeenCalled();
      expect(ledger.apply).not.toHaveBeenCalled();
    });

    it('applies the amount difference', async () => {
      await service.update(userId, 't1', { amount: 80000 });
      expect(appliedChanges()).toEqual([
        { accountId: 'cash', delta: '-30000' },
      ]);
    });

    it('moves the amount between wallets', async () => {
      prisma.account.findFirst.mockResolvedValue({ id: 'bank' });

      await service.update(userId, 't1', { accountId: 'bank' });

      expect(prisma.transaction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ accountId: 'bank' }),
        }),
      );
      expect(appliedChanges()).toEqual([
        { accountId: 'cash', delta: '50000' },
        { accountId: 'bank', delta: '-50000' },
      ]);
    });

    it('does not re-check the wallet when accountId is unchanged (archived wallet stays editable)', async () => {
      await service.update(userId, 't1', { accountId: 'cash', amount: 60000 });
      expect(prisma.account.findFirst).not.toHaveBeenCalled();
      expect(appliedChanges()).toEqual([
        { accountId: 'cash', delta: '-10000' },
      ]);
    });

    it('rejects moving into a foreign or archived wallet', async () => {
      prisma.account.findFirst.mockResolvedValue(null);
      await expect(
        service.update(userId, 't1', { accountId: 'old' }),
      ).rejects.toThrow(
        new BadRequestException(
          'Ví không tồn tại hoặc không thuộc về người dùng',
        ),
      );
      expect(ledger.apply).not.toHaveBeenCalled();
    });

    it('re-checks the category type against the resulting transaction type', async () => {
      await expect(
        service.update(userId, 't1', { type: TransactionType.INCOME }),
      ).rejects.toThrow(
        new BadRequestException('Loại danh mục không khớp với loại giao dịch'),
      );
      expect(prisma.category.findFirst).toHaveBeenCalledWith({
        where: { id: 'c1', userId, isDeleted: false },
      });
    });

    it('resets outcome fields when an expense becomes an income', async () => {
      prisma.category.findFirst.mockResolvedValue({
        id: 'c1',
        type: CategoryType.INCOME,
      });

      await service.update(userId, 't1', { type: TransactionType.INCOME });

      expect(prisma.transaction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 't1', userId },
          data: expect.objectContaining({
            type: TransactionType.INCOME,
            outcome: SpendOutcome.UNREVIEWED,
            leakReason: null,
            reviewedAt: null,
          }),
        }),
      );
      expect(appliedChanges()).toEqual([
        { accountId: 'cash', delta: '100000' },
      ]);
    });

    it('description-only edits touch no balance and skip category checks', async () => {
      await service.update(userId, 't1', { description: 'Bún chả' });

      const { data } = prisma.transaction.update.mock.calls[0][0];
      expect(data).not.toHaveProperty('outcome');
      expect(prisma.category.findFirst).not.toHaveBeenCalled();
      expect(ledger.apply).toHaveBeenCalledWith(prisma, []);
    });
    it('key-share locks the destination wallet when moving a transaction', async () => {
      prisma.account.findFirst.mockResolvedValue({ id: 'bank' });

      await service.update(userId, 't1', { accountId: 'bank' });

      const lockIndex = rawSql(prisma.$queryRaw).findIndex((sql) =>
        sql.includes('FOR KEY SHARE'),
      );
      expect(lockIndex).toBeGreaterThanOrEqual(0);
      expect(prisma.$queryRaw.mock.calls[lockIndex][1]).toBe('bank');
    });
  });

  describe('delete', () => {
    it('soft-deletes and reverses the balance after locking the row', async () => {
      await service.delete(userId, 't1');

      expect(prisma.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.transaction.findFirst.mock.invocationCallOrder[0],
      );
      expect(prisma.transaction.update).toHaveBeenCalledWith({
        where: { id: 't1', userId },
        data: { isDeleted: true, deletedAt: expect.any(Date) },
      });
      expect(appliedChanges()).toEqual([{ accountId: 'cash', delta: '50000' }]);
    });

    it('a second delete is NotFound and never reverses twice', async () => {
      prisma.transaction.findFirst.mockResolvedValue(null);

      await expect(service.delete(userId, 't1')).rejects.toThrow(
        new NotFoundException('Không tìm thấy giao dịch'),
      );
      expect(prisma.transaction.update).not.toHaveBeenCalled();
      expect(ledger.apply).not.toHaveBeenCalled();
    });
  });
});
