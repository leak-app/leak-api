import { Module } from '@nestjs/common';
import { TransactionsModule } from '@/modules/transactions/transactions.module';
import { ValuationsController } from './valuations.controller';
import { ValuationsService } from './valuations.service';

@Module({
  imports: [TransactionsModule],
  controllers: [ValuationsController],
  providers: [ValuationsService],
  exports: [ValuationsService],
})
export class ValuationsModule {}
