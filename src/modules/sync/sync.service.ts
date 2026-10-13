import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/common/prisma.service';
import {
  SyncRunStatus,
  type GoogleSheetsConnection,
  type SyncRun,
  type SyncTrigger,
} from '@/generated/prisma/client';
import {
  GoogleTransientError,
  ReconnectRequiredError,
  SpreadsheetNotFoundError,
} from './sheets.errors';
import type { TabInfo } from './sheets.requests';
import { SheetsClientService } from './sheets-client.service';
import {
  buildMetaRows,
  mapAccountRows,
  mapBudgetRows,
  mapGoalRows,
  mapTransactionRows,
} from './sync.mappers';
import type { SnapshotTabs } from './sync.schema';
import {
  TokenCryptoService,
  TokenDecryptionError,
} from './token-crypto.service';

export const SYNC_RUN_RETENTION = 30;

const MESSAGES = {
  reconnect: 'Google đã thu hồi quyền truy cập. Hãy kết nối lại.',
  transient: 'Google tạm thời không phản hồi. Sẽ thử lại lần đồng bộ sau.',
  unknown: 'Đồng bộ thất bại. Vui lòng thử lại sau.',
} as const;

/** One line for the log: the error type, an HTTP status when present, a bounded message. Never a token. */
function describeError(error: unknown): string {
  if (!(error instanceof Error)) return 'unknown error';
  const status = (error as { response?: { status?: number } }).response?.status;
  return `${error.name}${status ? ` (${status})` : ''}: ${error.message.slice(0, 200)}`;
}

@Injectable()
export class SyncService {
  private readonly _logger = new Logger(SyncService.name);
  /** Single API instance assumed (spec section 6.5): an in-process lock is enough. */
  private readonly _running = new Set<string>();

  constructor(
    private readonly _prisma: PrismaService,
    private readonly _crypto: TokenCryptoService,
    private readonly _sheets: SheetsClientService,
  ) {}

  isRunning(userId: string): boolean {
    return this._running.has(userId);
  }

  /** At boot nothing can be running, so any RUNNING row was left behind by a crash. */
  async failInterruptedRuns(): Promise<number> {
    const result = await this._prisma.syncRun.updateMany({
      where: { status: SyncRunStatus.RUNNING },
      data: {
        status: SyncRunStatus.FAILED,
        errorMessage: 'Interrupted',
        finishedAt: new Date(),
      },
    });
    return result.count;
  }

  /**
   * Exports one user's full snapshot. Returns null when there is no connection or a run
   * is already in progress; otherwise the finished SyncRun (SUCCESS or FAILED).
   */
  async runForUser(
    userId: string,
    trigger: SyncTrigger,
  ): Promise<SyncRun | null> {
    if (this._running.has(userId)) return null;
    this._running.add(userId);

    try {
      const connection = await this._prisma.googleSheetsConnection.findUnique({
        where: { userId },
      });
      if (!connection) return null;

      const run = await this._prisma.syncRun.create({
        data: { userId, trigger, status: SyncRunStatus.RUNNING },
      });

      try {
        const transactionCount = await this._export(connection);
        return await this._finish(run.id, userId, {
          status: SyncRunStatus.SUCCESS,
          transactionCount,
        });
      } catch (error) {
        return await this._fail(connection, run.id, error);
      }
    } finally {
      this._running.delete(userId);
    }
  }

  private async _export(connection: GoogleSheetsConnection): Promise<number> {
    const refreshToken = this._crypto.decrypt(connection.refreshTokenEnc);

    let spreadsheetId = connection.spreadsheetId;
    let tabs: TabInfo[];
    try {
      tabs = await this._sheets.getTabs(refreshToken, spreadsheetId);
    } catch (error) {
      if (!(error instanceof SpreadsheetNotFoundError)) throw error;
      spreadsheetId = await this._sheets.createSpreadsheet(refreshToken);
      await this._prisma.googleSheetsConnection.update({
        where: { id: connection.id },
        data: { spreadsheetId },
      });
      tabs = await this._sheets.getTabs(refreshToken, spreadsheetId);
    }

    const { snapshot, transactionCount } = await this._buildSnapshot(
      connection.userId,
    );
    await this._sheets.writeSnapshot(
      refreshToken,
      spreadsheetId,
      snapshot,
      tabs,
    );
    return transactionCount;
  }

  private async _buildSnapshot(
    userId: string,
  ): Promise<{ snapshot: SnapshotTabs; transactionCount: number }> {
    const [transactions, accounts, budgets, goals] = await Promise.all([
      this._prisma.transaction.findMany({
        where: { userId, isDeleted: false },
        include: {
          category: { select: { name: true } },
          account: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this._prisma.account.findMany({
        where: { userId, isDeleted: false },
        orderBy: { createdAt: 'asc' },
      }),
      this._prisma.budget.findMany({
        where: { userId, category: { isDeleted: false } },
        include: { category: { select: { name: true } } },
        orderBy: [{ year: 'desc' }, { month: 'desc' }],
      }),
      this._prisma.goal.findMany({
        where: { userId, isDeleted: false },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    return {
      transactionCount: transactions.length,
      snapshot: {
        transactions: mapTransactionRows(transactions),
        accounts: mapAccountRows(accounts),
        budgets: mapBudgetRows(budgets),
        goals: mapGoalRows(goals),
        meta: buildMetaRows({ now: new Date(), transactions }),
      },
    };
  }

  private async _fail(
    connection: GoogleSheetsConnection,
    runId: string,
    error: unknown,
  ): Promise<SyncRun> {
    this._logger.error(
      `Sync failed for user ${connection.userId}: ${describeError(error)}`,
    );

    let errorMessage: string = MESSAGES.unknown;
    if (
      error instanceof ReconnectRequiredError ||
      error instanceof TokenDecryptionError
    ) {
      errorMessage = MESSAGES.reconnect;
      await this._prisma.googleSheetsConnection.update({
        where: { id: connection.id },
        data: { needsReconnect: true },
      });
    } else if (error instanceof GoogleTransientError) {
      errorMessage = MESSAGES.transient;
    }

    return this._finish(runId, connection.userId, {
      status: SyncRunStatus.FAILED,
      errorMessage,
    });
  }

  private async _finish(
    runId: string,
    userId: string,
    data: {
      status: SyncRunStatus;
      transactionCount?: number;
      errorMessage?: string;
    },
  ): Promise<SyncRun> {
    const run = await this._prisma.syncRun.update({
      where: { id: runId },
      data: { ...data, finishedAt: new Date() },
    });
    await this._trimOldRuns(userId);
    return run;
  }

  private async _trimOldRuns(userId: string): Promise<void> {
    try {
      const keep = await this._prisma.syncRun.findMany({
        where: { userId },
        orderBy: { startedAt: 'desc' },
        take: SYNC_RUN_RETENTION,
        select: { id: true },
      });
      await this._prisma.syncRun.deleteMany({
        where: { userId, id: { notIn: keep.map((item) => item.id) } },
      });
    } catch (error) {
      this._logger.warn(
        `Could not trim old sync runs: ${describeError(error)}`,
      );
    }
  }
}
