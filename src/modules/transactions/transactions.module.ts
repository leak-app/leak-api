import { Module } from '@nestjs/common';
import { TransactionController } from './transactions.controller';
import { TransactionService } from './transactions.service';
import { LedgerService } from './ledger.service';
import { WalletResolver } from './wallet-resolver.service';

@Module({
  controllers: [TransactionController],
  providers: [TransactionService, LedgerService, WalletResolver],
  exports: [LedgerService, WalletResolver],
})
export class TransactionsModule {}
