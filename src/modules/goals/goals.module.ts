import { Module } from '@nestjs/common';
import { TransactionsModule } from '@/modules/transactions/transactions.module';
import { GoalController } from './goals.controller';
import { GoalService } from './goals.service';

@Module({
  imports: [TransactionsModule],
  controllers: [GoalController],
  providers: [GoalService],
})
export class GoalsModule {}
