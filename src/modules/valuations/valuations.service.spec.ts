import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { PrismaService } from '@/common/prisma.service';
import { AccountType, Prisma, ValuationKind } from '@/generated/prisma/client';
import type { LedgerService } from '@/modules/transactions/ledger.service';
import { ictToday } from './portfolio.calculator';
import { ValuationsService } from './valuations.service';

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */

const D = Prisma.Decimal;
const userId = 'user-1';
const fund = {
  id: 'fund',
  userId,
  name: 'Quỹ',
  type: AccountType.INVESTMENT,
  initialBalance: new D(45_000_000),
  currentBalance: new D(50_000_000), // 45M opening + 5M deposited
  createdAt: new Date('2026-09-01T00:00:00Z'),
  isDeleted: false,
};

const stored = (over: Record<string, unknown> = {}) => ({
  id: 'val-1',
  accountId: 'fund',
  userId,
  kind: ValuationKind.UPDATE,
  valuedAt: new Date('2026-10-01T00:00:00Z'),
  previousBalance: new D(45_000_000),
  netFlow: new D(5_000_000),
  balance: new D(52_000_000),
  gain: new D(2_000_000),
  adjustment: new D(2_000_000),
  isDeleted: false,
  ...over,
});

function createPrismaMock() {
  const prisma = {
    $transaction: jest.fn(),
    $queryRaw: jest.fn().mockResolvedValue([]),
    account: {
      findFirst: jest.fn().mockResolvedValue(fund),
      findMany: jest.fn().mockResolvedValue([]),
    },
    accountValuation: {
      count: jest.fn().mockResolvedValue(0),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest
        .fn()
        .mockImplementation(({ data }: { data: object }) =>
          Promise.resolve({ id: 'new', isDeleted: false, ...data }),
        ),
      update: jest
        .fn()
        .mockImplementation(({ where }: { where: { id: string } }) =>
          Promise.resolve(stored({ id: where.id, isDeleted: true })),
        ),
    },
  };
  prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
    fn(prisma),
  );
  return prisma;
}

describe('ValuationsService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let ledger: { apply: jest.Mock };
  let service: ValuationsService;

  const input = (over: Record<string, unknown> = {}) => ({
    balance: 52_000_000,
    expectedBalance: 50_000_000,
    ...over,
  });

  beforeEach(() => {
    prisma = createPrismaMock();
    ledger = { apply: jest.fn().mockResolvedValue(undefined) };
    service = new ValuationsService(
      prisma as unknown as PrismaService,
      ledger as unknown as LedgerService,
    );
  });

  describe('create', () => {
    it('records the gain and moves the wallet by the difference', async () => {
      const result = await service.create(userId, 'fund', input());

      const data = prisma.accountValuation.create.mock.calls[0][0].data;
      expect(data.kind).toBe(ValuationKind.UPDATE);
      expect(data.netFlow.toString()).toBe('5000000');
      expect(data.gain.toString()).toBe('2000000');
      expect(ledger.apply).toHaveBeenCalledTimes(1);
      const [, changes] = ledger.apply.mock.calls[0];
      expect(changes).toHaveLength(1);
      expect(changes[0].accountId).toBe('fund');
      expect(changes[0].delta.toString()).toBe('2000000');
      expect(result.periodReturn).toBe(4);
    });

    it('locks the wallet row before reading it', async () => {
      await service.create(userId, 'fund', input());
      expect(prisma.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.account.findFirst.mock.invocationCallOrder[0],
      );
    });

    it('rejects when the wallet balance moved since the client looked', async () => {
      await expect(
        service.create(userId, 'fund', input({ expectedBalance: 49_000_000 })),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.accountValuation.create).not.toHaveBeenCalled();
      expect(ledger.apply).not.toHaveBeenCalled();
    });

    it('rejects a missing or archived wallet', async () => {
      prisma.account.findFirst.mockResolvedValue(null);
      await expect(
        service.create(userId, 'gone', input()),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    describe('on a liquid wallet', () => {
      const cash = {
        ...fund,
        id: 'cash',
        type: AccountType.LIQUID,
        initialBalance: new D(1_000_000),
        currentBalance: new D(1_200_000),
      };
      const adjust = (over: Record<string, unknown> = {}) =>
        service.create(
          userId,
          'cash',
          input({ balance: 900_000, expectedBalance: 1_200_000, ...over }),
        );

      beforeEach(() => {
        prisma.account.findFirst.mockResolvedValue(cash);
      });

      it('sets the balance as a new starting point with no profit', async () => {
        await adjust();

        const data = prisma.accountValuation.create.mock.calls[0][0].data;
        expect(data.kind).toBe(ValuationKind.BASELINE);
        expect(data.gain.toString()).toBe('0');
        const [, changes] = ledger.apply.mock.calls[0];
        expect(changes[0].accountId).toBe('cash');
        expect(changes[0].delta.toString()).toBe('-300000');
      });

      it('can be adjusted again after an earlier update', async () => {
        prisma.accountValuation.findFirst.mockResolvedValue(
          stored({ accountId: 'cash', kind: ValuationKind.BASELINE }),
        );
        await adjust({ asBaseline: false });

        const data = prisma.accountValuation.create.mock.calls[0][0].data;
        expect(data.kind).toBe(ValuationKind.BASELINE);
        expect(data.gain.toString()).toBe('0');
      });

      it('still rejects when the balance moved meanwhile', async () => {
        await expect(
          adjust({ expectedBalance: 1_000_000 }),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(ledger.apply).not.toHaveBeenCalled();
      });
    });

    it('makes the first update a baseline when asked: capital, not profit', async () => {
      await service.create(userId, 'fund', input({ asBaseline: true }));
      const data = prisma.accountValuation.create.mock.calls[0][0].data;
      expect(data.kind).toBe(ValuationKind.BASELINE);
      expect(data.gain.toString()).toBe('0');
      expect(ledger.apply.mock.calls[0][1][0].delta.toString()).toBe('2000000');
    });

    it('refuses a baseline once an update exists', async () => {
      prisma.accountValuation.findFirst.mockResolvedValue(stored());
      await expect(
        service.create(
          userId,
          'fund',
          input({ asBaseline: true, balance: 51_000_000 }),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('measures from the previous update', async () => {
      prisma.account.findFirst.mockResolvedValue({
        ...fund,
        currentBalance: new D(60_000_000), // 52M + 8M deposited
      });
      prisma.accountValuation.findFirst.mockResolvedValue(
        stored({ balance: new D(52_000_000) }),
      );

      await service.create(
        userId,
        'fund',
        input({ balance: 59_000_000, expectedBalance: 60_000_000 }),
      );

      const data = prisma.accountValuation.create.mock.calls[0][0].data;
      expect(data.previousBalance.toString()).toBe('52000000');
      expect(data.netFlow.toString()).toBe('8000000');
      expect(data.gain.toString()).toBe('-1000000');
    });

    it('does not touch the ledger for a zero difference', async () => {
      await service.create(userId, 'fund', input({ balance: 50_000_000 }));
      expect(ledger.apply).toHaveBeenCalledWith(prisma, []);
    });

    it('rejects a future date and a date before the previous update', async () => {
      await expect(
        service.create(userId, 'fund', input({ valuedAt: '2999-01-01' })),
      ).rejects.toBeInstanceOf(BadRequestException);

      prisma.accountValuation.findFirst.mockResolvedValue(
        stored({ valuedAt: new Date('2026-10-10T00:00:00Z') }),
      );
      await expect(
        service.create(userId, 'fund', input({ valuedAt: '2026-10-09' })),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('delete', () => {
    it('soft-deletes the latest update and reverses its adjustment', async () => {
      prisma.accountValuation.findFirst.mockResolvedValue(stored());

      await service.delete(userId, 'val-1');

      expect(prisma.accountValuation.update).toHaveBeenCalledWith({
        where: { id: 'val-1' },
        data: { isDeleted: true, deletedAt: expect.any(Date) },
      });
      const [, changes] = ledger.apply.mock.calls[0];
      expect(changes[0].delta.toString()).toBe('-2000000');
    });

    it('refuses to delete an update that is not the latest', async () => {
      prisma.accountValuation.findFirst
        .mockResolvedValueOnce(stored({ id: 'old' })) // lookup by id
        .mockResolvedValueOnce(stored({ id: 'newer' })); // latest of the wallet

      await expect(service.delete(userId, 'old')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.accountValuation.update).not.toHaveBeenCalled();
      expect(ledger.apply).not.toHaveBeenCalled();
    });

    it('throws NotFound for an unknown or already deleted update', async () => {
      await expect(service.delete(userId, 'gone')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('hasUpdateAfter', () => {
    it('only counts investment wallets', async () => {
      await service.hasUpdateAfter(prisma as never, ['a'], new Date());
      expect(
        prisma.accountValuation.count.mock.calls[0][0].where.account,
      ).toEqual({ type: AccountType.INVESTMENT });
    });
  });

  describe('list', () => {
    it('returns the history newest first with each period return', async () => {
      prisma.accountValuation.findMany.mockResolvedValue([stored()]);
      const result = await service.list(userId, 'fund');
      expect(prisma.accountValuation.findMany).toHaveBeenCalledWith({
        where: { accountId: 'fund', userId, isDeleted: false },
        orderBy: { createdAt: 'desc' },
      });
      expect(result[0].periodReturn).toBe(4);
    });

    it('rejects a wallet the user does not own', async () => {
      prisma.account.findFirst.mockResolvedValue(null);
      await expect(service.list(userId, 'x')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('summarize', () => {
    it('summarises investment wallets only and takes the gains out of capital', async () => {
      prisma.accountValuation.findMany.mockResolvedValue([
        stored({ gain: new D(2_000_000) }),
      ]);
      const liquid = { ...fund, id: 'cash', type: AccountType.LIQUID };
      const wallet = { ...fund, currentBalance: new D(52_000_000) };

      const result = await service.summarize(userId, [liquid, wallet]);

      expect(result.has('cash')).toBe(false);
      const summary = result.get('fund');
      expect(summary.hasValuations).toBe(true);
      expect(summary.lastBalance?.toString()).toBe('52000000');
      expect(summary.profit.toString()).toBe('2000000');
      expect(summary.capital.toString()).toBe('50000000');
      expect(summary.returnPercent).toBe(4);
    });

    it('queries nothing without investment wallets', async () => {
      const result = await service.summarize(userId, [
        { ...fund, type: AccountType.LIQUID },
      ]);
      expect(result.size).toBe(0);
      expect(prisma.accountValuation.findMany).not.toHaveBeenCalled();
    });
  });

  describe('portfolio', () => {
    it('adds wallets up and reports stale ones', async () => {
      const fresh = {
        ...fund,
        id: 'fresh',
        name: 'Quỹ A',
        currentBalance: new D(52_000_000),
      };
      const old = {
        ...fund,
        id: 'old',
        name: 'Quỹ B',
        currentBalance: new D(10_000_000),
        createdAt: new Date('2020-01-01T00:00:00Z'),
      };
      prisma.account.findMany.mockResolvedValue([fresh, old]);
      const today = ictToday(new Date());
      prisma.accountValuation.findMany.mockResolvedValue([
        stored({
          accountId: 'fresh',
          valuedAt: today,
          balance: new D(52_000_000),
          gain: new D(2_000_000),
        }),
      ]);

      const result = await service.portfolio(userId, 12);

      expect(prisma.account.findMany).toHaveBeenCalledWith({
        where: { userId, isDeleted: false, type: AccountType.INVESTMENT },
        orderBy: { createdAt: 'asc' },
      });
      expect(result.totals.value.toString()).toBe('62000000');
      expect(result.totals.profit.toString()).toBe('2000000');
      expect(result.totals.capital.toString()).toBe('60000000');
      expect(result.totals.returnPercent).toBe(3.3);
      expect(result.totals.hasValuations).toBe(true);
      expect(result.wallets.map((w) => w.id)).toEqual(['fresh', 'old']);
      expect(result.staleWalletIds).toEqual(['old']);
      expect(result.months).toHaveLength(1);
      expect(result.months[0].balance.toString()).toBe('52000000');
    });

    it('is empty and has no updates without investment wallets', async () => {
      const result = await service.portfolio(userId, 12);
      expect(result.wallets).toEqual([]);
      expect(result.months).toEqual([]);
      expect(result.totals.hasValuations).toBe(false);
      expect(result.totals.returnPercent).toBeNull();
    });
  });
});
