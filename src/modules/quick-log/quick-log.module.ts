import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CategoriesModule } from '@/modules/categories/categories.module';
import { TransactionsModule } from '@/modules/transactions/transactions.module';
import { WalletsModule } from '@/modules/wallets/wallets.module';
import { GeminiParser } from './gemini.parser';
import { createGeminiParser } from './gemini.provider';
import { QuickLogController } from './quick-log.controller';
import { QuickLogService } from './quick-log.service';

@Module({
  imports: [CategoriesModule, WalletsModule, TransactionsModule],
  controllers: [QuickLogController],
  providers: [
    QuickLogService,
    {
      provide: GeminiParser,
      inject: [ConfigService],
      useFactory: createGeminiParser,
    },
  ],
})
export class QuickLogModule {}
