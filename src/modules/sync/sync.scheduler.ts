import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '@/common/prisma.service';
import { SyncTrigger } from '@/generated/prisma/client';
import { SyncConfig } from './sync.config';
import { SyncService } from './sync.service';

@Injectable()
export class SyncScheduler implements OnModuleInit {
  private readonly _logger = new Logger(SyncScheduler.name);

  constructor(
    private readonly _prisma: PrismaService,
    private readonly _config: SyncConfig,
    private readonly _sync: SyncService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      const count = await this._sync.failInterruptedRuns();
      if (count > 0) {
        this._logger.warn(`Marked ${count} interrupted sync run(s) as failed.`);
      }
    } catch (error) {
      this._logger.error('Failed to clean up interrupted sync runs', error);
    }
  }

  /**
   * Exports every user who turned the toggle on, one at a time so the shared Google quota is
   * never burst. One user's failure never affects another user or the API.
   */
  @Cron('0 0 * * *', { timeZone: 'Asia/Ho_Chi_Minh' })
  async handleNightlySync(): Promise<void> {
    if (!this._config.isAvailable) return;

    try {
      const connections = await this._prisma.googleSheetsConnection.findMany({
        where: { syncEnabled: true, needsReconnect: false },
        select: { userId: true },
      });
      this._logger.log(
        `Nightly Google Sheets sync for ${connections.length} user(s).`,
      );

      for (const { userId } of connections) {
        try {
          await this._sync.runForUser(userId, SyncTrigger.CRON);
        } catch (error) {
          this._logger.error(`Nightly sync crashed for user ${userId}`, error);
        }
      }
    } catch (error) {
      this._logger.error('Nightly Google Sheets sync could not start', error);
    }
  }
}
