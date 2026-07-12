import { Module } from '@nestjs/common';
import { GoalController } from './goals.controller';
import { GoalService } from './goals.service';

@Module({
  controllers: [GoalController],
  providers: [GoalService],
})
export class GoalsModule {}
