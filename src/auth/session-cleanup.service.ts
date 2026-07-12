import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { SessionRepository } from './session.repository';

@Injectable()
export class SessionCleanupService {
  private readonly _logger = new Logger(SessionCleanupService.name);

  constructor(private readonly _sessionRepository: SessionRepository) {}

  /**
   * Automatically removes expired or revoked sessions from the database.
   * Runs every day at midnight.
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleCleanup() {
    this._logger.log('Starting session cleanup task...');

    try {
      const deletedCount = await this._sessionRepository.deleteMany({
        expiresAt: { lt: new Date() },
        isRevoked: true,
      });

      this._logger.log(`Cleanup completed. Removed ${deletedCount} sessions.`);
    } catch (error) {
      this._logger.error('Failed to cleanup sessions', error);
    }
  }
}
