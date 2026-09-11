---
title: Architectural Tenets and Domain Module Organization
impact: HIGH
impactDescription: Establishes clear modular domain boundaries and enforces controller-service separation across the backend.
tags: architecture, modules, nestjs, domain, structure
---

# Architectural Tenets & Domain Module Organization

Leak App follows a modular domain architecture. Maintain clean separation of concerns and adhere strictly to repository structure standards.

---

## 1. Directory Structure (`api/src/`)

Organize all backend code by modular domain boundaries:

```text
api/
├── prisma/
│   ├── schema.prisma     # PostgreSQL schema definition
│   └── migrations/       # Versioned SQL migrations
└── src/
    ├── main.ts           # NestJS bootstrap, ValidationPipe, Swagger
    ├── app.module.ts     # Root module with ScheduleModule.forRoot()
    ├── auth/             # Passport JWT strategies, JwtAuthGuard, session management
    ├── user/             # User profile operations
    ├── common/           # Cross-cutting concerns (filters, interceptors, PrismaModule, decorators)
    ├── modules/          # Domain feature modules
    │   ├── wallets/      # Account balance tracking (LIQUID, INVESTMENT)
    │   ├── categories/   # Spending & income categories
    │   ├── transactions/ # Transaction CRUD, date filtering, pagination
    │   ├── budgets/      # Monthly category budget allocations
    │   ├── goals/        # Savings goals tracking
    │   ├── overview/     # Dashboard cash flow & category leak rate aggregations
    │   └── sync/         # Daily Google Sheets sync cron job & service
    └── utils/            # Pure utility functions
```

---

## 2. Core Architectural Principles

1. **PostgreSQL as Single Source of Truth**: All transactional, budgetary, and user data lives exclusively in PostgreSQL. External systems (e.g., Google Sheets) are strictly read-only downstream mirrors.
2. **Stateless REST API**: Controllers handle stateless HTTP requests with versioned endpoints (e.g., `/api/v1/transactions`).
3. **Thin Controllers & Rich Services**:
   - Controllers handle request routing, validation trigger, status codes, and user context extraction.
   - All business logic, balance recalculations, and database mutations reside inside `@Injectable()` domain Services.
4. **Authenticated Context Extraction**:
   - Extract the authenticated user context inside controllers using the custom `@CurrentUser('id')` or `@CurrentUser()` decorator.
   - Avoid parsing or trusting user IDs directly from request bodies or unverified query parameters.

---

## Code Comparison

### ❌ Incorrect (Polluting controller with business logic & manual user retrieval)
```typescript
@Controller('wallets')
export class WalletsController {
  constructor(private readonly prisma: PrismaService) {}

  @Post()
  async createWallet(@Req() req: any, @Body() body: any) {
    // FORBIDDEN: Untyped body, manual user extraction, direct DB mutation
    const userId = req.user.sub;
    if (body.balance < 0) {
      throw new BadRequestException('Balance cannot be negative');
    }
    return this.prisma.wallet.create({
      data: { userId, balance: body.balance, name: body.name },
    });
  }
}
```

### ✅ Correct (Thin controller, typed DTO, @CurrentUser decorator, dedicated service)
```typescript
@Controller({ path: 'wallets', version: '1' })
@UseGuards(JwtAuthGuard)
export class WalletsController {
  constructor(private readonly walletsService: WalletsService) {}

  @Post()
  async createWallet(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateWalletDto,
  ) {
    return this.walletsService.create(userId, dto);
  }
}
```
