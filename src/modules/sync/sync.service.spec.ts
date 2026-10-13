import { Logger } from '@nestjs/common';
import type { PrismaService } from '@/common/prisma.service';
import { Prisma, SyncRunStatus, SyncTrigger } from '@/generated/prisma/client';
import {
  GoogleTransientError,
  ReconnectRequiredError,
  SpreadsheetNotFoundError,
} from './sheets.errors';
import type { SheetsClientService } from './sheets-client.service';
import { SYNC_RUN_RETENTION, SyncService } from './sync.service';
import {
  TokenDecryptionError,
  type TokenCryptoService,
} from './token-crypto.service';

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */

const userId = 'user-1';
const connection = {
  id: 'conn-1',
  userId,
  googleEmail: 'user@gmail.com',
  refreshTokenEnc: 'v1:enc',
  spreadsheetId: 'sheet-1',
  syncEnabled: true,
  needsReconnect: false,
};
const tabs = [{ sheetId: 1, title: '_transactions', rowCount: 20_000 }];
const transaction = {
  id: 'tx-1',
  createdAt: new Date('2026-10-13T05:00:00Z'),
  type: 'EXPENSE',
  amount: new Prisma.Decimal('50000'),
  description: 'Cà phê',
  outcome: 'WORTH_IT',
  leakReason: null,
  reviewedAt: null,
  category: { name: 'Ăn uống' },
  account: { name: 'Tiền mặt' },
};

function createPrismaMock() {
  return {
    googleSheetsConnection: {
      findUnique: jest.fn().mockResolvedValue(connection),
      update: jest.fn().mockResolvedValue(connection),
    },
    syncRun: {
      create: jest.fn().mockResolvedValue({ id: 'run-1' }),
      update: jest
        .fn()
        .mockImplementation(({ data }) =>
          Promise.resolve({ id: 'run-1', ...data }),
        ),
      findMany: jest.fn().mockResolvedValue([{ id: 'run-1' }]),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      updateMany: jest.fn().mockResolvedValue({ count: 2 }),
    },
    transaction: { findMany: jest.fn().mockResolvedValue([transaction]) },
    account: { findMany: jest.fn().mockResolvedValue([]) },
    budget: { findMany: jest.fn().mockResolvedValue([]) },
    goal: { findMany: jest.fn().mockResolvedValue([]) },
  };
}

describe('SyncService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let crypto: { decrypt: jest.Mock };
  let sheets: {
    getTabs: jest.Mock;
    createSpreadsheet: jest.Mock;
    writeSnapshot: jest.Mock;
  };
  let service: SyncService;

  beforeEach(() => {
    prisma = createPrismaMock();
    crypto = { decrypt: jest.fn().mockReturnValue('refresh-token-plain') };
    sheets = {
      getTabs: jest.fn().mockResolvedValue(tabs),
      createSpreadsheet: jest.fn().mockResolvedValue('sheet-2'),
      writeSnapshot: jest.fn().mockResolvedValue(undefined),
    };
    service = new SyncService(
      prisma as unknown as PrismaService,
      crypto as unknown as TokenCryptoService,
      sheets as unknown as SheetsClientService,
    );
  });

  afterEach(() => jest.restoreAllMocks());

  describe('a successful run', () => {
    it('records the run, exports a snapshot and marks it successful', async () => {
      const run = await service.runForUser(userId, SyncTrigger.CRON);

      expect(prisma.syncRun.create).toHaveBeenCalledWith({
        data: {
          userId,
          trigger: SyncTrigger.CRON,
          status: SyncRunStatus.RUNNING,
        },
      });
      expect(crypto.decrypt).toHaveBeenCalledWith('v1:enc');
      expect(sheets.getTabs.mock.invocationCallOrder[0]).toBeLessThan(
        sheets.writeSnapshot.mock.invocationCallOrder[0],
      );

      const [token, spreadsheetId, snapshot, passedTabs] =
        sheets.writeSnapshot.mock.calls[0];
      expect(token).toBe('refresh-token-plain');
      expect(spreadsheetId).toBe('sheet-1');
      expect(passedTabs).toBe(tabs);
      expect(snapshot.transactions).toEqual([
        [
          'tx-1',
          '2026-10-13',
          202610,
          'EXPENSE',
          50000,
          'Ăn uống',
          'Tiền mặt',
          'Cà phê',
          'WORTH_IT',
          '',
          '',
        ],
      ]);
      expect(snapshot.meta).toContainEqual(['tx_count', 1]);

      expect(prisma.syncRun.update).toHaveBeenCalledWith({
        where: { id: 'run-1' },
        data: expect.objectContaining({
          status: SyncRunStatus.SUCCESS,
          transactionCount: 1,
          finishedAt: expect.any(Date),
        }),
      });
      expect(run).toMatchObject({ id: 'run-1', status: SyncRunStatus.SUCCESS });
    });

    it('reads only live rows, newest transactions first', async () => {
      await service.runForUser(userId, SyncTrigger.MANUAL);

      expect(prisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId, isDeleted: false },
          orderBy: { createdAt: 'desc' },
        }),
      );
      expect(prisma.account.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId, isDeleted: false } }),
      );
      expect(prisma.goal.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId, isDeleted: false } }),
      );
      expect(prisma.budget.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId, category: { isDeleted: false } },
        }),
      );
    });

    it('keeps only the latest runs', async () => {
      await service.runForUser(userId, SyncTrigger.CRON);

      expect(prisma.syncRun.findMany).toHaveBeenCalledWith({
        where: { userId },
        orderBy: { startedAt: 'desc' },
        take: SYNC_RUN_RETENTION,
        select: { id: true },
      });
      expect(prisma.syncRun.deleteMany).toHaveBeenCalledWith({
        where: { userId, id: { notIn: ['run-1'] } },
      });
    });
  });

  describe('failures', () => {
    it('flags the connection for reconnecting when Google revoked access', async () => {
      sheets.getTabs.mockRejectedValue(new ReconnectRequiredError());

      const run = await service.runForUser(userId, SyncTrigger.CRON);

      expect(prisma.googleSheetsConnection.update).toHaveBeenCalledWith({
        where: { id: 'conn-1' },
        data: { needsReconnect: true },
      });
      expect(run).toMatchObject({
        status: SyncRunStatus.FAILED,
        errorMessage: 'Google đã thu hồi quyền truy cập. Hãy kết nối lại.',
      });
      expect(sheets.writeSnapshot).not.toHaveBeenCalled();
    });

    it('flags the connection for reconnecting when the stored token cannot be decrypted', async () => {
      crypto.decrypt.mockImplementation(() => {
        throw new TokenDecryptionError();
      });

      await service.runForUser(userId, SyncTrigger.CRON);

      expect(prisma.googleSheetsConnection.update).toHaveBeenCalledWith({
        where: { id: 'conn-1' },
        data: { needsReconnect: true },
      });
    });

    it('does not flag the connection for a transient Google failure', async () => {
      sheets.writeSnapshot.mockRejectedValue(new GoogleTransientError());

      const run = await service.runForUser(userId, SyncTrigger.CRON);

      expect(prisma.googleSheetsConnection.update).not.toHaveBeenCalled();
      expect(run).toMatchObject({
        status: SyncRunStatus.FAILED,
        errorMessage:
          'Google tạm thời không phản hồi. Sẽ thử lại lần đồng bộ sau.',
      });
    });

    it('reports an unknown failure with a generic Vietnamese message', async () => {
      sheets.writeSnapshot.mockRejectedValue(new Error('boom'));

      const run = await service.runForUser(userId, SyncTrigger.CRON);

      expect(run).toMatchObject({
        status: SyncRunStatus.FAILED,
        errorMessage: 'Đồng bộ thất bại. Vui lòng thử lại sau.',
      });
    });

    it('never logs the refresh token', async () => {
      const logged: string[] = [];
      const capture = (message: unknown) => {
        logged.push(
          typeof message === 'string' ? message : JSON.stringify(message),
        );
      };
      jest.spyOn(Logger.prototype, 'error').mockImplementation(capture);
      jest.spyOn(Logger.prototype, 'warn').mockImplementation(capture);
      jest.spyOn(Logger.prototype, 'log').mockImplementation(capture);
      sheets.writeSnapshot.mockRejectedValue(new Error('boom'));

      await service.runForUser(userId, SyncTrigger.CRON);

      expect(logged.length).toBeGreaterThan(0);
      expect(logged.join('\n')).not.toContain('refresh-token-plain');
    });
  });

  describe('a deleted spreadsheet', () => {
    it('creates a new one, stores its id and exports into it', async () => {
      sheets.getTabs
        .mockRejectedValueOnce(new SpreadsheetNotFoundError())
        .mockResolvedValueOnce(tabs);

      await service.runForUser(userId, SyncTrigger.CRON);

      expect(sheets.createSpreadsheet).toHaveBeenCalledWith(
        'refresh-token-plain',
      );
      expect(prisma.googleSheetsConnection.update).toHaveBeenCalledWith({
        where: { id: 'conn-1' },
        data: { spreadsheetId: 'sheet-2' },
      });
      expect(sheets.getTabs).toHaveBeenLastCalledWith(
        'refresh-token-plain',
        'sheet-2',
      );
      expect(sheets.writeSnapshot.mock.calls[0][1]).toBe('sheet-2');
    });
  });

  describe('guards', () => {
    it('does nothing for a user without a connection', async () => {
      prisma.googleSheetsConnection.findUnique.mockResolvedValue(null);

      await expect(
        service.runForUser(userId, SyncTrigger.CRON),
      ).resolves.toBeNull();
      expect(prisma.syncRun.create).not.toHaveBeenCalled();
    });

    it('refuses a second run for the same user while one is in progress, then recovers', async () => {
      let release!: () => void;
      sheets.writeSnapshot.mockReturnValueOnce(
        new Promise<void>((resolve) => {
          release = resolve;
        }),
      );

      const first = service.runForUser(userId, SyncTrigger.CRON);
      await new Promise((resolve) => setImmediate(resolve));
      expect(service.isRunning(userId)).toBe(true);

      await expect(
        service.runForUser(userId, SyncTrigger.MANUAL),
      ).resolves.toBeNull();
      expect(prisma.syncRun.create).toHaveBeenCalledTimes(1);

      release();
      await first;
      expect(service.isRunning(userId)).toBe(false);
      await expect(
        service.runForUser(userId, SyncTrigger.MANUAL),
      ).resolves.not.toBeNull();
    });

    it('releases the lock after a failure', async () => {
      sheets.writeSnapshot.mockRejectedValueOnce(new Error('boom'));
      await service.runForUser(userId, SyncTrigger.CRON);
      expect(service.isRunning(userId)).toBe(false);
    });
  });

  describe('failInterruptedRuns', () => {
    it('marks runs left RUNNING by a crash as failed', async () => {
      await expect(service.failInterruptedRuns()).resolves.toBe(2);
      expect(prisma.syncRun.updateMany).toHaveBeenCalledWith({
        where: { status: SyncRunStatus.RUNNING },
        data: {
          status: SyncRunStatus.FAILED,
          errorMessage: 'Interrupted',
          finishedAt: expect.any(Date),
        },
      });
    });
  });
});
