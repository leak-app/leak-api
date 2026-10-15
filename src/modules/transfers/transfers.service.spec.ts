import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { PrismaService } from '@/common/prisma.service';
import { Prisma } from '@/generated/prisma/client';
import type { LedgerService } from '@/modules/transactions/ledger.service';
import type { WalletResolver } from '@/modules/transactions/wallet-resolver.service';
import type { ValuationsService } from '@/modules/valuations/valuations.service';
import { TransfersService } from './transfers.service';

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */

const userId = 'user-1';
const stored = {
  id: 'tr-1',
  fromAccountId: 'cash',
  toAccountId: 'fund',
  userId,
  amount: new Prisma.Decimal(5_000_000),
  createdAt: new Date('2026-10-02T03:00:00Z'),
  isDeleted: false,
};

function createPrismaMock() {
  const prisma = {
    $transaction: jest.fn(),
    transfer: {
      create: jest
        .fn()
        .mockImplementation(({ data }: { data: object }) =>
          Promise.resolve({ id: 'new', ...data }),
        ),
      findFirst: jest.fn().mockResolvedValue(stored),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({ ...stored, isDeleted: true }),
    },
  };
  prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
    fn(prisma),
  );
  return prisma;
}

describe('TransfersService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let ledger: { apply: jest.Mock };
  let wallets: { resolveExplicit: jest.Mock };
  let valuations: { hasUpdateAfter: jest.Mock };
  let service: TransfersService;

  const dto = (over: Record<string, unknown> = {}) => ({
    fromAccountId: 'cash',
    toAccountId: 'fund',
    amount: 5_000_000,
    ...over,
  });

  beforeEach(() => {
    prisma = createPrismaMock();
    ledger = { apply: jest.fn().mockResolvedValue(undefined) };
    wallets = {
      resolveExplicit: jest
        .fn()
        .mockImplementation((_tx: unknown, _user: string, id: string) =>
          Promise.resolve(id),
        ),
    };
    valuations = { hasUpdateAfter: jest.fn().mockResolvedValue(false) };
    service = new TransfersService(
      prisma as unknown as PrismaService,
      ledger as unknown as LedgerService,
      wallets as unknown as WalletResolver,
      valuations as unknown as ValuationsService,
    );
  });

  describe('create', () => {
    it('moves the money through the ledger and stores no income or expense', async () => {
      await service.create(userId, dto());

      const [, changes] = ledger.apply.mock.calls[0];
      expect(
        changes.map((c: { accountId: string; delta: Prisma.Decimal }) => [
          c.accountId,
          c.delta.toString(),
        ]),
      ).toEqual([
        ['cash', '-5000000'],
        ['fund', '5000000'],
      ]);
      const data = prisma.transfer.create.mock.calls[0][0].data;
      expect(data.amount).toBe(5_000_000);
      expect(data.occurredAt).toBeInstanceOf(Date);
    });

    it('checks both wallets belong to the user and are active', async () => {
      await service.create(userId, dto());
      expect(wallets.resolveExplicit).toHaveBeenCalledWith(
        prisma,
        userId,
        'cash',
      );
      expect(wallets.resolveExplicit).toHaveBeenCalledWith(
        prisma,
        userId,
        'fund',
      );
    });

    it('rejects the same wallet on both sides before touching the database', async () => {
      await expect(
        service.create(userId, dto({ toAccountId: 'cash' })),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects a future date', async () => {
      await expect(
        service.create(userId, dto({ occurredAt: '2999-01-01' })),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('does not move anything when a wallet is refused', async () => {
      wallets.resolveExplicit.mockRejectedValueOnce(
        new BadRequestException('x'),
      );
      await expect(service.create(userId, dto())).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.transfer.create).not.toHaveBeenCalled();
      expect(ledger.apply).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('lists all active transfers, newest first', async () => {
      await service.findAll(userId, {});
      const args = prisma.transfer.findMany.mock.calls[0][0];
      expect(args.where).toEqual({ userId, isDeleted: false });
    });

    it('filters by wallet on either side', async () => {
      await service.findAll(userId, { accountId: 'fund' });
      const args = prisma.transfer.findMany.mock.calls[0][0];
      expect(args.where.OR).toEqual([
        { fromAccountId: 'fund' },
        { toAccountId: 'fund' },
      ]);
    });
  });

  describe('delete', () => {
    it('soft-deletes and moves the money back', async () => {
      await service.delete(userId, 'tr-1');

      expect(prisma.transfer.update.mock.calls[0][0].data).toEqual({
        isDeleted: true,
        deletedAt: expect.any(Date),
      });
      const [, changes] = ledger.apply.mock.calls[0];
      expect(
        changes.map((c: { accountId: string; delta: Prisma.Decimal }) => [
          c.accountId,
          c.delta.toString(),
        ]),
      ).toEqual([
        ['cash', '5000000'],
        ['fund', '-5000000'],
      ]);
    });

    it('refuses when a later balance update already counted it', async () => {
      valuations.hasUpdateAfter.mockResolvedValue(true);
      await expect(service.delete(userId, 'tr-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(valuations.hasUpdateAfter).toHaveBeenCalledWith(
        prisma,
        ['cash', 'fund'],
        stored.createdAt,
      );
      expect(ledger.apply).not.toHaveBeenCalled();
    });

    it('throws NotFound for an unknown or already deleted transfer', async () => {
      prisma.transfer.findFirst.mockResolvedValue(null);
      await expect(service.delete(userId, 'gone')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
