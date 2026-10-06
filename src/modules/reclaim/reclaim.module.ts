import { Module } from '@nestjs/common';
import { GoalsModule } from '@/modules/goals/goals.module';
import { ReclaimController } from './reclaim.controller';
import { ReclaimService } from './reclaim.service';

@Module({
  imports: [GoalsModule],
  controllers: [ReclaimController],
  providers: [ReclaimService],
})
export class ReclaimModule {}
