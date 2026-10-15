import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';

import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { CommonModule } from './common/common.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { UserModule } from './user/user.module';

import { WalletsModule } from './modules/wallets/wallets.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { GoalsModule } from './modules/goals/goals.module';
import { OverviewModule } from './modules/overview/overview.module';
import { BudgetsModule } from './modules/budgets/budgets.module';
import { MailModule } from './modules/mail/mail.module';
import { OutcomesModule } from './modules/outcomes/outcomes.module';
import { ReclaimModule } from './modules/reclaim/reclaim.module';
import { SyncModule } from './modules/sync/sync.module';
import { TransfersModule } from './modules/transfers/transfers.module';
import { ValuationsModule } from './modules/valuations/valuations.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    CommonModule,
    AuthModule,
    UserModule,
    WalletsModule,
    CategoriesModule,
    TransactionsModule,
    GoalsModule,
    OverviewModule,
    BudgetsModule,
    MailModule,
    OutcomesModule,
    ReclaimModule,
    SyncModule,
    ValuationsModule,
    TransfersModule,
  ],
  controllers: [],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
  ],
})
export class AppModule {}
