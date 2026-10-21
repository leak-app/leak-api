import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AiCommentaryService } from './ai-commentary.service';

@Injectable()
export class AiCommentaryScheduler {
  private readonly _logger = new Logger(AiCommentaryScheduler.name);
  /** Single API instance assumed (as in sync): an in-process flag is enough. */
  private _running = false;

  constructor(private readonly _commentary: AiCommentaryService) {}

  /** Every 15 seconds. Cheap when idle: one indexed query. */
  @Cron('*/15 * * * * *')
  async tick(): Promise<void> {
    if (!this._commentary.isEnabled || this._running) return;
    this._running = true;
    try {
      await this._commentary.processDue();
    } catch (error) {
      this._logger.error('Buddy worker tick failed', error);
    } finally {
      this._running = false;
    }
  }

  @Cron('0 3 * * *', { timeZone: 'Asia/Ho_Chi_Minh' })
  async purge(): Promise<void> {
    try {
      const count = await this._commentary.purgeFinished();
      if (count > 0) this._logger.log(`Purged ${count} finished buddy job(s).`);
    } catch (error) {
      this._logger.error('Buddy job purge failed', error);
    }
  }
}
