import { Module } from '@nestjs/common';
import { AiCommentaryModule } from '@/modules/ai-commentary/ai-commentary.module';
import { TransactionController } from './transactions.controller';
import { TransactionService } from './transactions.service';
import { LedgerService } from './ledger.service';
import { WalletResolver } from './wallet-resolver.service';

@Module({
  imports: [AiCommentaryModule],
  controllers: [TransactionController],
  providers: [TransactionService, LedgerService, WalletResolver],
  exports: [TransactionService, LedgerService, WalletResolver],
})
export class TransactionsModule {}
