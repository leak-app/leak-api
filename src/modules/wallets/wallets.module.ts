import { Module } from '@nestjs/common';
import { TransactionsModule } from '@/modules/transactions/transactions.module';
import { ValuationsModule } from '@/modules/valuations/valuations.module';
import { WalletController } from './wallets.controller';
import { WalletService } from './wallets.service';

@Module({
  imports: [TransactionsModule, ValuationsModule],
  controllers: [WalletController],
  providers: [WalletService],
})
export class WalletsModule {}
