import { Module } from '@nestjs/common';
import { TransactionsModule } from '@/modules/transactions/transactions.module';
import { ValuationsModule } from '@/modules/valuations/valuations.module';
import { TransfersController } from './transfers.controller';
import { TransfersService } from './transfers.service';

@Module({
  imports: [TransactionsModule, ValuationsModule],
  controllers: [TransfersController],
  providers: [TransfersService],
})
export class TransfersModule {}
