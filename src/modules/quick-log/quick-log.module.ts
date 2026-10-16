import { Module } from '@nestjs/common';
import { CategoriesModule } from '@/modules/categories/categories.module';
import { TransactionsModule } from '@/modules/transactions/transactions.module';
import { WalletsModule } from '@/modules/wallets/wallets.module';
import { QuickLogController } from './quick-log.controller';
import { QuickLogService } from './quick-log.service';

@Module({
  imports: [CategoriesModule, WalletsModule, TransactionsModule],
  controllers: [QuickLogController],
  providers: [QuickLogService],
})
export class QuickLogModule {}
