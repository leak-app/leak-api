import { ConflictException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '@/common/prisma.service';
import { AccountType, Prisma } from '@/generated/prisma/client';
import type { LedgerService } from '@/modules/transactions/ledger.service';
import type { ValuationsService } from '@/modules/valuations/valuations.service';
import { WalletService } from './wallets.service';

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */

const userId = 'user-1';
const cash = {
  id: 'cash',
  userId,
  name: 'Tiền mặt',
  type: AccountType.LIQUID,
  initialBalance: new Prisma.Decimal(100000),
  currentBalance: new Prisma.Decimal(40000),
  isDeleted: false,
};

function createPrismaMock() {
  const prisma = {
    $transaction: jest.fn(),
    $queryRaw: jest.fn().mockResolvedValue([]),
    account: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(cash),
      count: jest.fn().mockResolvedValue(1),
      create: jest.fn().mockResolvedValue(cash),
      update: jest.fn().mockResolvedValue(cash),
    },
    accountValuation: { count: jest.fn().mockResolvedValue(0) },
  };
  prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
    fn(prisma),
  );
  return prisma;
}

describe('WalletService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let ledger: { shiftInitialBalance: jest.Mock };
  let valuations: { summarize: jest.Mock };
  let service: WalletService;

  beforeEach(() => {
    prisma = createPrismaMock();
    ledger = { shiftInitialBalance: jest.fn().mockResolvedValue(undefined) };
    valuations = { summarize: jest.fn().mockResolvedValue(new Map()) };
    service = new WalletService(
      prisma as unknown as PrismaService,
      ledger as unknown as LedgerService,
      valuations as unknown as ValuationsService,
    );
  });

  it('findAll lists only active wallets', async () => {
    await service.findAll(userId);
    expect(prisma.account.findMany).toHaveBeenCalledWith({
      where: { userId, isDeleted: false },
      orderBy: { createdAt: 'asc' },
    });
  });

  it('findAll attaches profit figures to investment wallets and null to the rest', async () => {
    const fund = { ...cash, id: 'fund', type: AccountType.INVESTMENT };
    prisma.account.findMany.mockResolvedValue([cash, fund]);
    const summary = { hasValuations: true };
    valuations.summarize.mockResolvedValue(new Map([['fund', summary]]));

    const result = await service.findAll(userId);

    expect(result[0]).toMatchObject({ id: 'cash', valuation: null });
    expect(result[1]).toMatchObject({ id: 'fund', valuation: summary });
  });

  describe('update', () => {
    it('shifts balances by the initial-balance difference', async () => {
      await service.update(userId, 'cash', { initialBalance: 120000 });

      const [tx, accountId, delta] = ledger.shiftInitialBalance.mock.calls[0];
      expect(tx).toBe(prisma);
      expect(accountId).toBe('cash');
      expect((delta as Prisma.Decimal).toString()).toBe('20000');
    });

    it('locks the wallet row before reading it, so the delta is computed from a fresh balance', async () => {
      await service.update(userId, 'cash', { initialBalance: 120000 });

      expect(prisma.$queryRaw).toHaveBeenCalled();
      expect(prisma.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.account.findFirst.mock.invocationCallOrder[0],
      );
    });

    it('renames without touching balances', async () => {
      await service.update(userId, 'cash', { name: 'Ví chính' });

      expect(ledger.shiftInitialBalance).not.toHaveBeenCalled();
      expect(prisma.account.update).toHaveBeenCalledWith({
        where: { id: 'cash' },
        data: { name: 'Ví chính' },
      });
    });

    it('refuses to move the opening balance of an investment wallet that has updates', async () => {
      prisma.account.findFirst.mockResolvedValue({
        ...cash,
        type: AccountType.INVESTMENT,
      });
      prisma.accountValuation.count.mockResolvedValue(1);

      await expect(
        service.update(userId, 'cash', { initialBalance: 1 }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(ledger.shiftInitialBalance).not.toHaveBeenCalled();
    });

    it('still renames an investment wallet that has updates', async () => {
      prisma.account.findFirst.mockResolvedValue({
        ...cash,
        type: AccountType.INVESTMENT,
      });
      prisma.accountValuation.count.mockResolvedValue(1);

      await service.update(userId, 'cash', { name: 'Quỹ' });
      expect(prisma.account.update).toHaveBeenCalled();
    });

    it('never writes currentBalance directly', async () => {
      await service.update(userId, 'cash', { name: 'X', initialBalance: 1 });
      for (const [arg] of prisma.account.update.mock.calls) {
        expect(arg.data).not.toHaveProperty('currentBalance');
      }
    });

    it('throws NotFound for a missing or archived wallet', async () => {
      prisma.account.findFirst.mockResolvedValue(null);
      await expect(
        service.update(userId, 'gone', { name: 'X' }),
      ).rejects.toThrow(new NotFoundException('Không tìm thấy ví'));
      expect(prisma.account.findFirst).toHaveBeenCalledWith({
        where: { id: 'gone', userId, isDeleted: false },
      });
    });
  });

  describe('delete (archive)', () => {
    it('archives when another active wallet exists, after locking the user’s wallets', async () => {
      await service.delete(userId, 'cash');

      expect(prisma.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.account.count.mock.invocationCallOrder[0],
      );
      expect(prisma.account.count).toHaveBeenCalledWith({
        where: { userId, isDeleted: false, id: { not: 'cash' } },
      });
      expect(prisma.account.update).toHaveBeenCalledWith({
        where: { id: 'cash' },
        data: { isDeleted: true, deletedAt: expect.any(Date) },
      });
    });

    it('refuses to archive the last active wallet', async () => {
      prisma.account.count.mockResolvedValue(0);

      await expect(service.delete(userId, 'cash')).rejects.toThrow(
        new ConflictException('Không thể lưu trữ ví cuối cùng'),
      );
      expect(prisma.account.update).not.toHaveBeenCalled();
    });

    it('throws NotFound for a missing or already archived wallet', async () => {
      prisma.account.findFirst.mockResolvedValue(null);
      await expect(service.delete(userId, 'gone')).rejects.toThrow(
        new NotFoundException('Không tìm thấy ví'),
      );
    });
  });
});
