---
title: Google Sheets Background Sync and Cron Resilience
impact: HIGH
impactDescription: Protects API stability by isolating external third-party sync failures and preventing duplicate snapshot records.
tags: cron, background-job, google-sheets, schedule, resilience, idempotency
---

# Google Sheets Background Sync & Cron Resilience

Google Sheets is strictly a secondary, downstream mirror and must **never** be used as a primary database. The synchronization job must run in complete isolation from user-facing API request cycles.

---

## 1. Cron Scheduling & Configuration

- Background sync is managed via `@nestjs/schedule` inside `src/modules/sync/`.
- Ensure `ScheduleModule.forRoot()` is registered in `app.module.ts`.
- Schedule the daily sync job using `@Cron('0 0 * * *')` (midnight).

---

## 2. Fault Tolerance & Non-Blocking Isolation

- **Third-Party Isolation**: Google Sheets API latency, rate limits (HTTP 429), authentication expiry, or network downtime **MUST NEVER** crash the Node process, throw unhandled rejections, or degrade user API performance.
- **Explicit Logging**: Always wrap external API calls in `try/catch` blocks and log failures with `this.logger.error(...)` including stack traces and contextual account IDs.

---

## 3. Idempotency on Retries

- Balance snapshots and transaction exports MUST be idempotent.
- Key snapshot entries by date (`YYYY-MM-DD`) and account ID so that re-running or manually triggering the job does not produce duplicate rows in Google Sheets.

---

## Code Comparison

### ❌ Incorrect (Unprotected sync that can crash or duplicate rows)
```typescript
@Injectable()
export class SyncService {
  @Cron('0 0 * * *')
  async handleSync() {
    // FORBIDDEN: No try/catch, unhandled rejection will crash or leak memory
    const accounts = await this.prisma.account.findMany();
    for (const acc of accounts) {
      // Blind append creates duplicates on retry
      await this.sheetsClient.appendRow([new Date(), acc.id, acc.balance]);
    }
  }
}
```

### ✅ Correct (Isolated try/catch, logger, and idempotent update)
```typescript
@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sheetsClient: GoogleSheetsClient,
  ) {}

  @Cron('0 0 * * *')
  async handleDailySync(): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);
    this.logger.log(`Starting daily Google Sheets sync for ${today}`);

    try {
      const accounts = await this.prisma.account.findMany({ where: { isDeleted: false } });

      for (const account of accounts) {
        // Idempotent upsert by date and account ID
        await this.sheetsClient.upsertDailySnapshot({
          date: today,
          accountId: account.id,
          accountName: account.name,
          balance: account.currentBalance.toNumber(),
        });
      }

      this.logger.log(`Daily sync successfully finished for ${today}`);
    } catch (error) {
      // Capture error without throwing unhandled exceptions to the process
      this.logger.error(`Daily Google Sheets sync failed for date ${today}:`, (error as Error).stack);
    }
  }
}
```
