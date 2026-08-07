import { Controller, Get } from '@nestjs/common';
import { GetUser } from '@/auth/get-user.decorator';
import type { User } from '@/generated/prisma/client';
import { OverviewService } from './overview.service';

@Controller('overview')
export class OverviewController {
  constructor(private readonly _overviewService: OverviewService) {}

  @Get('summary')
  async getOverviewSummary(@GetUser() user: User) {
    return this._overviewService.getOverviewSummary(user.id);
  }

  @Get()
  async getOverview(@GetUser() user: User) {
    return this._overviewService.getOverviewSummary(user.id);
  }

  @Get('daily')
  async getDailyReport(@GetUser() user: User) {
    return this._overviewService.getDailyReport(user.id);
  }

  @Get('weekly')
  async getWeeklyReport(@GetUser() user: User) {
    return this._overviewService.getWeeklyReport(user.id);
  }

  @Get('monthly')
  async getMonthlyReport(@GetUser() user: User) {
    return this._overviewService.getMonthlyReport(user.id);
  }
}
