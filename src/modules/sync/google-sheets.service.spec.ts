import { ConflictException } from '@nestjs/common';
import type { PrismaService } from '@/common/prisma.service';
import { SyncRunStatus, SyncTrigger } from '@/generated/prisma/client';
import {
  ConnectFailedError,
  type GoogleOAuthService,
} from './google-oauth.service';
import {
  GoogleSheetsService,
  MANUAL_RUN_COOLDOWN_MS,
} from './google-sheets.service';
import {
  ReconnectRequiredError,
  SpreadsheetNotFoundError,
} from './sheets.errors';
import type { SheetsClientService } from './sheets-client.service';
import type { SyncConfig } from './sync.config';
import type { SyncService } from './sync.service';
import {
  TokenDecryptionError,
  type TokenCryptoService,
} from './token-crypto.service';

/* eslint-disable @typescript-eslint/no-unsafe-assignment */

const userId = 'user-1';
const connection = {
  id: 'conn-1',
  userId,
  googleEmail: 'user@gmail.com',
  refreshTokenEnc: 'enc(old-token)',
  spreadsheetId: 'sheet-1',
  syncEnabled: true,
  needsReconnect: false,
};

function setup(overrides: { available?: boolean } = {}) {
  const prisma = {
    googleSheetsConnection: {
      findUnique: jest.fn().mockResolvedValue(connection),
      update: jest.fn().mockResolvedValue(connection),
      upsert: jest.fn().mockResolvedValue(connection),
      delete: jest.fn().mockResolvedValue(connection),
    },
    syncRun: { findFirst: jest.fn().mockResolvedValue(null) },
    user: { findUnique: jest.fn().mockResolvedValue({ id: userId }) },
  };
  const config = {
    isAvailable: overrides.available ?? true,
    frontendUrl: 'https://leak.example',
  };
  const oauth = {
    buildAuthUrl: jest
      .fn()
      .mockResolvedValue('https://accounts.google.com/auth?state=s'),
    verifyState: jest.fn().mockResolvedValue(userId),
    exchangeCode: jest.fn().mockResolvedValue({
      refreshToken: 'new-token',
      googleEmail: 'new@gmail.com',
    }),
    revoke: jest.fn().mockResolvedValue(undefined),
  };
  const crypto = {
    encrypt: jest.fn((value: string) => `enc(${value})`),
    decrypt: jest.fn((value: string) => value.replace(/^enc\(|\)$/g, '')),
  };
  const sheets = {
    getTabs: jest.fn().mockResolvedValue([]),
    createSpreadsheet: jest.fn().mockResolvedValue('new-sheet'),
  };
  const sync = {
    isRunning: jest.fn().mockReturnValue(false),
    runForUser: jest.fn().mockResolvedValue({ id: 'run-1' }),
  };
  const service = new GoogleSheetsService(
    prisma as unknown as PrismaService,
    config as unknown as SyncConfig,
    oauth as unknown as GoogleOAuthService,
    crypto as unknown as TokenCryptoService,
    sheets as unknown as SheetsClientService,
    sync as unknown as SyncService,
  );
  return { service, prisma, config, oauth, crypto, sheets, sync };
}

describe('GoogleSheetsService', () => {
  describe('getStatus', () => {
    it('reports an unavailable feature without touching the database', async () => {
      const { service, prisma } = setup({ available: false });

      await expect(service.getStatus(userId)).resolves.toMatchObject({
        available: false,
        connected: false,
        syncEnabled: false,
        lastRun: null,
      });
      expect(prisma.googleSheetsConnection.findUnique).not.toHaveBeenCalled();
    });

    it('reports a user who never connected', async () => {
      const { service, prisma } = setup();
      prisma.googleSheetsConnection.findUnique.mockResolvedValue(null);

      await expect(service.getStatus(userId)).resolves.toEqual({
        available: true,
        connected: false,
        syncEnabled: false,
        needsReconnect: false,
        googleEmail: null,
        spreadsheetUrl: null,
        lastRun: null,
      });
    });

    it('reports a connected user with the last run and never exposes the token', async () => {
      const { service, prisma } = setup();
      prisma.syncRun.findFirst.mockResolvedValue({
        id: 'run-1',
        trigger: SyncTrigger.CRON,
        status: SyncRunStatus.SUCCESS,
        transactionCount: 12,
        errorMessage: null,
        startedAt: new Date('2026-10-13T17:00:00Z'),
        finishedAt: new Date('2026-10-13T17:00:05Z'),
      });

      const status = await service.getStatus(userId);

      expect(status).toMatchObject({
        connected: true,
        syncEnabled: true,
        googleEmail: 'user@gmail.com',
        spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/sheet-1/edit',
        lastRun: {
          status: 'SUCCESS',
          trigger: 'CRON',
          transactionCount: 12,
          startedAt: '2026-10-13T17:00:00.000Z',
          finishedAt: '2026-10-13T17:00:05.000Z',
          errorMessage: null,
        },
      });
      expect(JSON.stringify(status)).not.toContain('enc(');
    });
  });

  describe('createConnectUrl', () => {
    it('returns the Google consent URL for the user', async () => {
      const { service, oauth } = setup();
      await expect(service.createConnectUrl(userId)).resolves.toBe(
        'https://accounts.google.com/auth?state=s',
      );
      expect(oauth.buildAuthUrl).toHaveBeenCalledWith(userId);
    });

    it('conflicts when the feature is not configured', async () => {
      const { service } = setup({ available: false });
      await expect(service.createConnectUrl(userId)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('when the feature is not configured', () => {
    it('refuses to toggle or run, even for a user who has a stored connection', async () => {
      const { service, prisma, sync } = setup({ available: false });

      await expect(service.setEnabled(userId, true)).rejects.toBeInstanceOf(
        ConflictException,
      );
      await expect(service.runNow(userId)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.googleSheetsConnection.update).not.toHaveBeenCalled();
      expect(sync.runForUser).not.toHaveBeenCalled();
    });
  });

  describe('handleCallback', () => {
    const redirect = (query: string) => `https://leak.example/profile?${query}`;

    it('redirects with reason=denied when the user declines consent', async () => {
      const { service, prisma } = setup();
      await expect(
        service.handleCallback({ error: 'access_denied' }),
      ).resolves.toEqual({
        redirectUrl: redirect('sheets=error&reason=denied'),
        firstSyncUserId: null,
      });
      expect(prisma.googleSheetsConnection.upsert).not.toHaveBeenCalled();
    });

    it('redirects with reason=state when code or state is missing', async () => {
      const { service } = setup();
      await expect(
        service.handleCallback({ code: 'c' }),
      ).resolves.toMatchObject({
        redirectUrl: redirect('sheets=error&reason=state'),
      });
    });

    it('redirects with reason=state for an invalid state', async () => {
      const { service, oauth } = setup();
      oauth.verifyState.mockRejectedValue(new Error('bad'));
      await expect(
        service.handleCallback({ code: 'c', state: 's' }),
      ).resolves.toMatchObject({
        redirectUrl: redirect('sheets=error&reason=state'),
      });
    });

    it('redirects with reason=state when the user no longer exists', async () => {
      const { service, prisma } = setup();
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.handleCallback({ code: 'c', state: 's' }),
      ).resolves.toMatchObject({
        redirectUrl: redirect('sheets=error&reason=state'),
      });
    });

    it('connects a new user: encrypts the token, creates a sheet, enables sync', async () => {
      const { service, prisma, sheets } = setup();
      prisma.googleSheetsConnection.findUnique.mockResolvedValue(null);

      const result = await service.handleCallback({ code: 'c', state: 's' });

      expect(sheets.createSpreadsheet).toHaveBeenCalledWith('new-token');
      const fields = {
        googleEmail: 'new@gmail.com',
        refreshTokenEnc: 'enc(new-token)',
        spreadsheetId: 'new-sheet',
        syncEnabled: true,
        needsReconnect: false,
      };
      expect(prisma.googleSheetsConnection.upsert).toHaveBeenCalledWith({
        where: { userId },
        create: { userId, ...fields },
        update: fields,
      });
      expect(result).toEqual({
        redirectUrl: redirect('sheets=connected'),
        firstSyncUserId: userId,
      });
    });

    it('reconnecting keeps the existing spreadsheet when it is still readable', async () => {
      const { service, prisma, sheets } = setup();

      await service.handleCallback({ code: 'c', state: 's' });

      expect(sheets.getTabs).toHaveBeenCalledWith('new-token', 'sheet-1');
      expect(sheets.createSpreadsheet).not.toHaveBeenCalled();
      expect(prisma.googleSheetsConnection.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({ spreadsheetId: 'sheet-1' }),
        }),
      );
    });

    it.each([
      ['a deleted sheet', new SpreadsheetNotFoundError()],
      ['a sheet owned by another Google account', new ReconnectRequiredError()],
    ])(
      'reconnecting creates a fresh spreadsheet after %s',
      async (_label, error) => {
        const { service, prisma, sheets } = setup();
        sheets.getTabs.mockRejectedValue(error);

        await service.handleCallback({ code: 'c', state: 's' });

        expect(sheets.createSpreadsheet).toHaveBeenCalledWith('new-token');
        expect(prisma.googleSheetsConnection.upsert).toHaveBeenCalledWith(
          expect.objectContaining({
            update: expect.objectContaining({ spreadsheetId: 'new-sheet' }),
          }),
        );
      },
    );

    it('fails with reason=unknown and keeps the connection when the existing sheet check errors unexpectedly', async () => {
      const { service, prisma, sheets } = setup();
      sheets.getTabs.mockRejectedValue(new Error('boom'));

      await expect(
        service.handleCallback({ code: 'c', state: 's' }),
      ).resolves.toMatchObject({
        redirectUrl: redirect('sheets=error&reason=unknown'),
        firstSyncUserId: null,
      });
      expect(prisma.googleSheetsConnection.upsert).not.toHaveBeenCalled();
    });

    it.each(['token', 'scope'] as const)(
      'a failed exchange (%s) redirects with that reason and leaves the working connection untouched',
      async (reason) => {
        const { service, prisma, oauth } = setup();
        oauth.exchangeCode.mockRejectedValue(new ConnectFailedError(reason));

        await expect(
          service.handleCallback({ code: 'replayed', state: 's' }),
        ).resolves.toEqual({
          redirectUrl: redirect(`sheets=error&reason=${reason}`),
          firstSyncUserId: null,
        });
        expect(prisma.googleSheetsConnection.upsert).not.toHaveBeenCalled();
        expect(prisma.googleSheetsConnection.delete).not.toHaveBeenCalled();
      },
    );
  });

  describe('runConnectSync', () => {
    it('runs a CONNECT sync and swallows any error', async () => {
      const { service, sync } = setup();
      sync.runForUser.mockRejectedValue(new Error('boom'));

      await expect(service.runConnectSync(userId)).resolves.toBeUndefined();
      expect(sync.runForUser).toHaveBeenCalledWith(userId, SyncTrigger.CONNECT);
    });
  });

  describe('setEnabled', () => {
    it('conflicts when the user is not connected', async () => {
      const { service, prisma } = setup();
      prisma.googleSheetsConnection.findUnique.mockResolvedValue(null);
      await expect(service.setEnabled(userId, true)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('conflicts when enabling a connection that needs reconnecting', async () => {
      const { service, prisma } = setup();
      prisma.googleSheetsConnection.findUnique.mockResolvedValue({
        ...connection,
        needsReconnect: true,
      });
      await expect(service.setEnabled(userId, true)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('turns the toggle off and keeps the connection', async () => {
      const { service, prisma } = setup();
      await service.setEnabled(userId, false);
      expect(prisma.googleSheetsConnection.update).toHaveBeenCalledWith({
        where: { userId },
        data: { syncEnabled: false },
      });
    });

    it('turns the toggle on', async () => {
      const { service, prisma } = setup();
      await service.setEnabled(userId, true);
      expect(prisma.googleSheetsConnection.update).toHaveBeenCalledWith({
        where: { userId },
        data: { syncEnabled: true },
      });
    });
  });

  describe('runNow', () => {
    it('runs a MANUAL sync and returns the status', async () => {
      const { service, sync } = setup();
      await expect(service.runNow(userId)).resolves.toMatchObject({
        connected: true,
      });
      expect(sync.runForUser).toHaveBeenCalledWith(userId, SyncTrigger.MANUAL);
    });

    it('conflicts without a connection or when it needs reconnecting', async () => {
      const { service, prisma } = setup();
      prisma.googleSheetsConnection.findUnique.mockResolvedValue(null);
      await expect(service.runNow(userId)).rejects.toBeInstanceOf(
        ConflictException,
      );

      prisma.googleSheetsConnection.findUnique.mockResolvedValue({
        ...connection,
        needsReconnect: true,
      });
      await expect(service.runNow(userId)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('rejects with 429 inside the 60-second cooldown and says how long to wait', async () => {
      const { service, prisma, sync } = setup();
      prisma.syncRun.findFirst.mockResolvedValue({
        startedAt: new Date(Date.now() - 10_000),
      });

      await expect(service.runNow(userId)).rejects.toMatchObject({
        status: 429,
        message: expect.stringMatching(/^Vui lòng đợi (49|50) giây/),
      });
      expect(sync.runForUser).not.toHaveBeenCalled();
    });

    it('allows a run once the cooldown has passed', async () => {
      const { service, prisma, sync } = setup();
      prisma.syncRun.findFirst.mockResolvedValue({
        startedAt: new Date(Date.now() - MANUAL_RUN_COOLDOWN_MS - 1000),
      });
      await service.runNow(userId);
      expect(sync.runForUser).toHaveBeenCalled();
    });

    it('conflicts while a run is in progress, and when the lock is lost at the last moment', async () => {
      const { service, sync } = setup();
      sync.isRunning.mockReturnValue(true);
      await expect(service.runNow(userId)).rejects.toBeInstanceOf(
        ConflictException,
      );

      sync.isRunning.mockReturnValue(false);
      sync.runForUser.mockResolvedValue(null);
      await expect(service.runNow(userId)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('disconnect', () => {
    it('revokes the token at Google, then deletes the connection', async () => {
      const { service, prisma, oauth } = setup();

      await expect(service.disconnect(userId)).resolves.toEqual({
        disconnected: true,
      });

      expect(oauth.revoke).toHaveBeenCalledWith('old-token');
      expect(oauth.revoke.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.googleSheetsConnection.delete.mock.invocationCallOrder[0],
      );
      expect(prisma.googleSheetsConnection.delete).toHaveBeenCalledWith({
        where: { userId },
      });
    });

    it('still deletes the connection when Google revocation fails', async () => {
      const { service, prisma, oauth } = setup();
      oauth.revoke.mockRejectedValue(new Error('google down'));

      await service.disconnect(userId);
      expect(prisma.googleSheetsConnection.delete).toHaveBeenCalled();
    });

    it('still deletes the connection when the stored token cannot be decrypted', async () => {
      const { service, prisma, crypto, oauth } = setup();
      crypto.decrypt.mockImplementation(() => {
        throw new TokenDecryptionError();
      });

      await service.disconnect(userId);
      expect(oauth.revoke).not.toHaveBeenCalled();
      expect(prisma.googleSheetsConnection.delete).toHaveBeenCalled();
    });

    it('is a no-op for a user who is not connected', async () => {
      const { service, prisma, oauth } = setup();
      prisma.googleSheetsConnection.findUnique.mockResolvedValue(null);

      await expect(service.disconnect(userId)).resolves.toEqual({
        disconnected: true,
      });
      expect(oauth.revoke).not.toHaveBeenCalled();
      expect(prisma.googleSheetsConnection.delete).not.toHaveBeenCalled();
    });
  });
});
