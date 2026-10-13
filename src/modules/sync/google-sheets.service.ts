import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '@/common/prisma.service';
import { SyncTrigger } from '@/generated/prisma/client';
import { ConnectFailedError, GoogleOAuthService } from './google-oauth.service';
import {
  ReconnectRequiredError,
  SpreadsheetNotFoundError,
} from './sheets.errors';
import { SheetsClientService } from './sheets-client.service';
import { SyncConfig } from './sync.config';
import { SyncService } from './sync.service';
import { TokenCryptoService } from './token-crypto.service';

export const MANUAL_RUN_COOLDOWN_MS = 60_000;

export interface GoogleSheetsStatus {
  available: boolean;
  connected: boolean;
  syncEnabled: boolean;
  needsReconnect: boolean;
  googleEmail: string | null;
  spreadsheetUrl: string | null;
  lastRun: {
    status: 'RUNNING' | 'SUCCESS' | 'FAILED';
    trigger: 'CRON' | 'MANUAL' | 'CONNECT';
    startedAt: string;
    finishedAt: string | null;
    transactionCount: number;
    errorMessage: string | null;
  } | null;
}

export interface CallbackQuery {
  code?: string;
  state?: string;
  error?: string;
}

export interface CallbackResult {
  redirectUrl: string;
  /** Set when the controller should start the first sync after sending the redirect. */
  firstSyncUserId: string | null;
}

const NOT_CONFIGURED = 'Tính năng đồng bộ Google Sheets chưa được cấu hình.';
const NOT_CONNECTED = 'Bạn chưa kết nối Google Sheets.';
const NEEDS_RECONNECT = 'Cần kết nối lại Google Sheets.';
const ALREADY_RUNNING = 'Đang đồng bộ, vui lòng đợi hoàn tất.';

const spreadsheetUrl = (spreadsheetId: string) =>
  `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

function describeError(error: unknown): string {
  return error instanceof Error
    ? `${error.name}: ${error.message.slice(0, 200)}`
    : 'unknown error';
}

@Injectable()
export class GoogleSheetsService {
  private readonly _logger = new Logger(GoogleSheetsService.name);

  constructor(
    private readonly _prisma: PrismaService,
    private readonly _config: SyncConfig,
    private readonly _oauth: GoogleOAuthService,
    private readonly _crypto: TokenCryptoService,
    private readonly _sheets: SheetsClientService,
    private readonly _sync: SyncService,
  ) {}

  async getStatus(userId: string): Promise<GoogleSheetsStatus> {
    const empty: GoogleSheetsStatus = {
      available: this._config.isAvailable,
      connected: false,
      syncEnabled: false,
      needsReconnect: false,
      googleEmail: null,
      spreadsheetUrl: null,
      lastRun: null,
    };
    if (!empty.available) return empty;

    const [connection, lastRun] = await Promise.all([
      this._prisma.googleSheetsConnection.findUnique({ where: { userId } }),
      this._prisma.syncRun.findFirst({
        where: { userId },
        orderBy: { startedAt: 'desc' },
      }),
    ]);

    return {
      ...empty,
      connected: Boolean(connection),
      syncEnabled: connection?.syncEnabled ?? false,
      needsReconnect: connection?.needsReconnect ?? false,
      googleEmail: connection?.googleEmail ?? null,
      spreadsheetUrl: connection
        ? spreadsheetUrl(connection.spreadsheetId)
        : null,
      lastRun: lastRun
        ? {
            status: lastRun.status,
            trigger: lastRun.trigger,
            startedAt: lastRun.startedAt.toISOString(),
            finishedAt: lastRun.finishedAt?.toISOString() ?? null,
            transactionCount: lastRun.transactionCount,
            errorMessage: lastRun.errorMessage,
          }
        : null,
    };
  }

  async createConnectUrl(userId: string): Promise<string> {
    this._requireAvailable();
    return this._oauth.buildAuthUrl(userId);
  }

  /** Never throws: every failure becomes a redirect back to the app with a reason. */
  async handleCallback(query: CallbackQuery): Promise<CallbackResult> {
    const fail = (reason: string): CallbackResult => ({
      redirectUrl: this._profileUrl({ sheets: 'error', reason }),
      firstSyncUserId: null,
    });

    if (!this._config.isAvailable) return fail('unavailable');
    if (query.error)
      return fail(query.error === 'access_denied' ? 'denied' : 'unknown');
    if (!query.code || !query.state) return fail('state');

    let userId: string;
    try {
      userId = await this._oauth.verifyState(query.state);
    } catch {
      return fail('state');
    }
    const user = await this._prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) return fail('state');

    try {
      const grant = await this._oauth.exchangeCode(query.code);
      const spreadsheetId = await this._resolveSpreadsheet(
        userId,
        grant.refreshToken,
      );
      const fields = {
        googleEmail: grant.googleEmail,
        refreshTokenEnc: this._crypto.encrypt(grant.refreshToken),
        spreadsheetId,
        syncEnabled: true,
        needsReconnect: false,
      };
      // Written only after everything above succeeded, so a failed or replayed consent
      // can never damage a working connection.
      await this._prisma.googleSheetsConnection.upsert({
        where: { userId },
        create: { userId, ...fields },
        update: fields,
      });
      return {
        redirectUrl: this._profileUrl({ sheets: 'connected' }),
        firstSyncUserId: userId,
      };
    } catch (error) {
      if (error instanceof ConnectFailedError) return fail(error.reason);
      this._logger.error(
        `Google Sheets connect failed for user ${userId}: ${describeError(error)}`,
      );
      return fail('unknown');
    }
  }

  /** Runs the first sync after a successful connect. Errors are logged, never thrown. */
  async runConnectSync(userId: string): Promise<void> {
    try {
      await this._sync.runForUser(userId, SyncTrigger.CONNECT);
    } catch (error) {
      this._logger.error(
        `First sync after connect failed for user ${userId}: ${describeError(error)}`,
      );
    }
  }

  async setEnabled(
    userId: string,
    enabled: boolean,
  ): Promise<GoogleSheetsStatus> {
    this._requireAvailable();
    const connection = await this._prisma.googleSheetsConnection.findUnique({
      where: { userId },
    });
    if (!connection) throw new ConflictException(NOT_CONNECTED);
    if (enabled && connection.needsReconnect) {
      throw new ConflictException(NEEDS_RECONNECT);
    }
    await this._prisma.googleSheetsConnection.update({
      where: { userId },
      data: { syncEnabled: enabled },
    });
    return this.getStatus(userId);
  }

  async runNow(userId: string): Promise<GoogleSheetsStatus> {
    this._requireAvailable();
    const connection = await this._prisma.googleSheetsConnection.findUnique({
      where: { userId },
    });
    if (!connection) throw new ConflictException(NOT_CONNECTED);
    if (connection.needsReconnect) throw new ConflictException(NEEDS_RECONNECT);

    const lastRun = await this._prisma.syncRun.findFirst({
      where: { userId },
      orderBy: { startedAt: 'desc' },
      select: { startedAt: true },
    });
    if (lastRun) {
      const elapsed = Date.now() - lastRun.startedAt.getTime();
      if (elapsed < MANUAL_RUN_COOLDOWN_MS) {
        const seconds = Math.ceil((MANUAL_RUN_COOLDOWN_MS - elapsed) / 1000);
        throw new HttpException(
          `Vui lòng đợi ${seconds} giây trước khi đồng bộ lại.`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    if (this._sync.isRunning(userId))
      throw new ConflictException(ALREADY_RUNNING);
    const run = await this._sync.runForUser(userId, SyncTrigger.MANUAL);
    if (!run) throw new ConflictException(ALREADY_RUNNING);

    return this.getStatus(userId);
  }

  async disconnect(userId: string): Promise<{ disconnected: true }> {
    const connection = await this._prisma.googleSheetsConnection.findUnique({
      where: { userId },
    });
    if (!connection) return { disconnected: true };

    try {
      await this._oauth.revoke(
        this._crypto.decrypt(connection.refreshTokenEnc),
      );
    } catch (error) {
      // Revocation is best effort: the user must be able to disconnect even if Google is down.
      this._logger.warn(
        `Could not revoke the Google token for user ${userId}: ${describeError(error)}`,
      );
    }
    await this._prisma.googleSheetsConnection.delete({ where: { userId } });
    return { disconnected: true };
  }

  /** Keeps the existing spreadsheet when the new token can still read it, otherwise creates one. */
  private async _resolveSpreadsheet(
    userId: string,
    refreshToken: string,
  ): Promise<string> {
    const existing = await this._prisma.googleSheetsConnection.findUnique({
      where: { userId },
      select: { spreadsheetId: true },
    });
    if (existing) {
      try {
        await this._sheets.getTabs(refreshToken, existing.spreadsheetId);
        return existing.spreadsheetId;
      } catch (error) {
        // Deleted, or owned by another Google account than the one that just consented.
        if (
          !(
            error instanceof SpreadsheetNotFoundError ||
            error instanceof ReconnectRequiredError
          )
        ) {
          throw error;
        }
      }
    }
    return this._sheets.createSpreadsheet(refreshToken);
  }

  /** Without configuration every mutating route answers 409 (spec section 5). */
  private _requireAvailable(): void {
    if (!this._config.isAvailable) throw new ConflictException(NOT_CONFIGURED);
  }

  private _profileUrl(params: Record<string, string>): string {
    return `${this._config.frontendUrl}/profile?${new URLSearchParams(params).toString()}`;
  }
}
