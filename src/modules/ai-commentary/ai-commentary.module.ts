import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiCommentaryController } from './ai-commentary.controller';
import { AiCommentaryScheduler } from './ai-commentary.scheduler';
import { AiCommentaryService } from './ai-commentary.service';
import { BuddyGenerator } from './buddy.generator';
import { createBuddyGenerator } from './buddy.provider';

@Module({
  controllers: [AiCommentaryController],
  providers: [
    AiCommentaryService,
    AiCommentaryScheduler,
    {
      provide: BuddyGenerator,
      inject: [ConfigService],
      useFactory: createBuddyGenerator,
    },
  ],
  exports: [AiCommentaryService],
})
export class AiCommentaryModule {}
