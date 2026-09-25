import { Module } from '@nestjs/common';
import { TransactionController } from './transactions.controller';
import { TransactionService } from './transactions.service';
import { LedgerService } from './ledger.service';

@Module({
  controllers: [TransactionController],
  providers: [TransactionService, LedgerService],
  exports: [LedgerService],
})
export class TransactionsModule {}
